import asyncio
import os
import signal
import redis.asyncio as redis
import json
import uuid


class TaskManager:
    def __init__(self):
        self.current_process = None
        self.queue = asyncio.Queue()

    async def kill_current_task(self):
        if self.current_process:
            print("Killing current task...", flush=True)
            try:
                pgid = os.getpgid(self.current_process.pid)
                os.killpg(pgid, signal.SIGKILL)
                await self.current_process.wait()
            except Exception as e:
                print(f"Error killing process: {e}", flush=True)
            self.current_process = None

    def clear_queue(self):
        print("Clearing command queue...", flush=True)
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except asyncio.QueueEmpty:
                break


task_manager = TaskManager()
AGENT_ID = str(uuid.uuid4())


async def heartbeat(r: redis.Redis, agent_id: str):
    """Periodically refresh a Redis key so the backend can count live agents."""
    while True:
        try:
            await r.setex(f"agent:heartbeat:{agent_id}", 30, 1)
        except Exception:
            pass
        await asyncio.sleep(10)


async def execute_and_stream(command: str, macro_name: str, r: redis.Redis, run_id: str, is_last: bool = True):
    await r.publish("agent_responses", json.dumps({
        "status": "started",
        "run_id": run_id,
        "command": command,
        "macro_name": macro_name,
        "is_last": is_last,
        "message": "Starting execution..."
    }))

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        task_manager.current_process = process

        async def stream_output(stream, is_error=False):
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded_line = line.decode('utf-8').rstrip()
                payload = {
                    "status": "streaming",
                    "run_id": run_id,
                    "command": command,
                    "macro_name": macro_name,
                    "error" if is_error else "message": decoded_line
                }
                await r.publish("agent_responses", json.dumps(payload))

        await asyncio.gather(
            stream_output(process.stdout),
            stream_output(process.stderr, is_error=True)
        )

        returncode = await process.wait()

        await r.publish("agent_responses", json.dumps({
            "status": "completed",
            "run_id": run_id,
            "command": command,
            "macro_name": macro_name,
            "is_last": is_last,
            "message": f"Command finished with exit code {returncode}",
            "exit_code": returncode,
        }))

    except Exception as e:
        await r.publish("agent_responses", json.dumps({
            "status": "error",
            "run_id": run_id,
            "command": command,
            "macro_name": macro_name,
            "is_last": is_last,
            "error": f"Failed to execute command: {str(e)}"
        }))
    finally:
        task_manager.current_process = None


async def command_worker(r: redis.Redis):
    while True:
        command, macro_name, run_id, is_last = await task_manager.queue.get()
        try:
            await execute_and_stream(command, macro_name, r, run_id, is_last)
        except Exception as e:
            print(f"Worker error: {e}")
        finally:
            task_manager.queue.task_done()


async def control_listener(r: redis.Redis):
    """Subscribe to agent_control for kill signals — received by ALL agents."""
    pubsub = r.pubsub()
    await pubsub.subscribe("agent_control")
    print("Subscribed to 'agent_control' channel.", flush=True)

    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                if data.get("type") == "kill":
                    print("Received KILL command. Resetting agent...", flush=True)
                    await task_manager.kill_current_task()
                    task_manager.clear_queue()
                    await r.publish("agent_responses", json.dumps({
                        "status": "reset",
                        "command": "",
                        "message": "Agent tasks killed and queue cleared."
                    }))
            except Exception as e:
                print(f"Error processing control message: {e}", flush=True)


async def command_listener(r: redis.Redis):
    """BRPOP from agent_commands queue — only ONE agent picks up each command."""
    print("Listening on 'agent_commands' queue (BRPOP). Waiting for commands...", flush=True)

    while True:
        try:
            result = await r.brpop("agent_commands", timeout=0)
            if result is None:
                continue
            _, raw = result
            data = json.loads(raw)
            command = data.get("command")
            macro_name = data.get("macro_name", "")
            run_id = data.get("run_id") or str(uuid.uuid4())
            is_last = data.get("is_last", True)
            if command:
                print(f"Queuing command: {command} (macro: {macro_name}, run_id: {run_id}, is_last: {is_last})", flush=True)
                await task_manager.queue.put((command, macro_name, run_id, is_last))
        except Exception as e:
            print(f"Error processing command message: {e}", flush=True)
            await asyncio.sleep(1)


async def run_agent():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    print(f"Agent starting, connecting to Redis at {redis_url}...")

    r = redis.from_url(redis_url)

    await asyncio.gather(
        command_worker(r),
        command_listener(r),
        control_listener(r),
        heartbeat(r, AGENT_ID),
        return_exceptions=True,
    )


if __name__ == "__main__":
    asyncio.run(run_agent())
