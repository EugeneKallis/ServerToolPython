import asyncio
import os
import redis.asyncio as redis
import json
import signal

try:
    from scripts.db import mark_current_runs_as_reset
except ImportError:
    # Fallback for different working directories
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from scripts.db import mark_current_runs_as_reset

class TaskManager:
    def __init__(self):
        self.current_process = None
        self.queue = asyncio.Queue()

    async def kill_current_task(self):
        if self.current_process:
            print("Killing current task...", flush=True)
            try:
                self.current_process.kill()
                await self.current_process.wait()
            except Exception as e:
                print(f"Error killing process: {e}", flush=True)
            self.current_process = None
            # Update DB to reflect the kill
            mark_current_runs_as_reset()

    def clear_queue(self):
        print("Clearing command queue...", flush=True)
        # Also mark any queued things that might have been started (unlikely but safe)
        mark_current_runs_as_reset()
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except asyncio.QueueEmpty:
                break

task_manager = TaskManager()

async def execute_and_stream(command: str, macro_name: str, r: redis.Redis):
    # Send start message
    await r.publish("agent_responses", json.dumps({
        "status": "started",
        "command": command,
        "message": "Starting execution..."
    }))
    
    # Set environment variable for log_run to pick up
    env = os.environ.copy()
    if macro_name:
        env["AGENT_RUN_NAME"] = macro_name

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
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
                    "command": command,
                    "error" if is_error else "message": decoded_line
                }
                await r.publish("agent_responses", json.dumps(payload))
                
        # Run both stdout and stderr streaming concurrently
        await asyncio.gather(
            stream_output(process.stdout),
            stream_output(process.stderr, is_error=True)
        )
        
        returncode = await process.wait()
        
        # Send complete message
        await r.publish("agent_responses", json.dumps({
            "status": "completed",
            "command": command,
            "message": f"Command finished with exit code {returncode}"
        }))
        
    except Exception as e:
        await r.publish("agent_responses", json.dumps({
            "status": "error",
            "command": command,
            "error": f"Failed to execute command: {str(e)}"
        }))
    finally:
        task_manager.current_process = None

async def command_worker(r: redis.Redis):
    while True:
        command, macro_name = await task_manager.queue.get()
        try:
            await execute_and_stream(command, macro_name, r)
        except Exception as e:
            print(f"Worker error: {e}")
        finally:
            task_manager.queue.task_done()

async def run_agent():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    print(f"Agent starting, connecting to Redis at {redis_url}...")
    
    r = redis.from_url(redis_url)
    pubsub = r.pubsub()
    
    # Start the worker task to process commands sequentially
    asyncio.create_task(command_worker(r))
    
    # Subscribe to commands channel
    await pubsub.subscribe("agent_commands")
    print("Subscribed to 'agent_commands' channel. Waiting for commands...", flush=True)
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                msg_type = data.get("type")
                
                if msg_type == "kill":
                    print("Received KILL command. Resetting agent...", flush=True)
                    await task_manager.kill_current_task()
                    task_manager.clear_queue()
                    await r.publish("agent_responses", json.dumps({
                        "status": "reset",
                        "message": "Agent tasks killed and queue cleared."
                    }))
                    continue

                command = data.get("command")
                macro_name = data.get("macro_name", "")
                if command:
                    print(f"Queuing command: {command} (macro: {macro_name})", flush=True)
                    # Add to queue as a tuple
                    await task_manager.queue.put((command, macro_name))
            except Exception as e:
                print(f"Error processing message: {e}", flush=True)

if __name__ == "__main__":
    asyncio.run(run_agent())
