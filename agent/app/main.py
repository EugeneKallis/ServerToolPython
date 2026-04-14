import asyncio
import os
import signal
import redis.asyncio as redis
import json
import uuid
import logging

logger = logging.getLogger("agent")
logging.basicConfig(level=logging.INFO, format="%(name)s %(levelname)s %(message)s")


class TaskManager:
    def __init__(self):
        self.current_process = None
        self.queue = asyncio.Queue()

    async def kill_current_task(self):
        if self.current_process:
            logger.info("Killing current task...")
            try:
                pgid = os.getpgid(self.current_process.pid)
                os.killpg(pgid, signal.SIGKILL)
                await self.current_process.wait()
            except Exception as e:
                logger.info(f"Error killing process: {e}")
            self.current_process = None

    def clear_queue(self):
        logger.info("Clearing command queue...")
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except asyncio.QueueEmpty:
                break


task_manager = TaskManager()
AGENT_ID = str(uuid.uuid4())
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


async def publish_response(data: dict):
    try:
        r = redis.from_url(REDIS_URL, socket_connect_timeout=5)
        await r.publish("agent_responses", json.dumps(data))
        await r.aclose()
    except Exception as e:
        logger.info(f"Failed to publish response: {e}")


async def heartbeat():
    while True:
        try:
            r = redis.from_url(REDIS_URL, socket_connect_timeout=3)
            await r.setex(f"agent:heartbeat:{AGENT_ID}", 30, 1)
            await r.aclose()
        except asyncio.CancelledError:
            break
        except Exception:
            pass
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            break


async def execute_and_stream(
    command: str, macro_name: str, run_id: str, is_last: bool = True
):
    logger.info(f"Executing command: {command}")
    await publish_response(
        {
            "status": "started",
            "run_id": run_id,
            "command": command,
            "macro_name": macro_name,
            "is_last": is_last,
            "message": "Starting execution...",
        }
    )

    try:
        logger.info(f"Creating subprocess for: {command}")
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        logger.info(f"Subprocess created, pid={process.pid}")
        task_manager.current_process = process

        stdout_lines = []
        stderr_lines = []

        async def read_stdout():
            logger.info("read_stdout started")
            while True:
                line = await process.stdout.readline()
                if not line:
                    logger.info("read_stdout got empty line, breaking")
                    break
                stdout_lines.append((False, line.decode("utf-8").rstrip()))
            logger.info("read_stdout finished")

        async def read_stderr():
            logger.info("read_stderr started")
            while True:
                line = await process.stderr.readline()
                if not line:
                    logger.info("read_stderr got empty line, breaking")
                    break
                stderr_lines.append((True, line.decode("utf-8").rstrip()))
            logger.info("read_stderr finished")

        logger.info("Starting gather for stdout/stderr readers")
        await asyncio.gather(read_stdout(), read_stderr())
        logger.info("stdout/stderr readers completed")

        returncode = await process.wait()
        logger.info(f"Process wait completed with returncode={returncode}")

        logger.info(
            f"Publishing {len(stdout_lines)} stdout lines and {len(stderr_lines)} stderr lines"
        )
        for is_error, line in stdout_lines + stderr_lines:
            await publish_response(
                {
                    "status": "streaming",
                    "run_id": run_id,
                    "command": command,
                    "macro_name": macro_name,
                    "error" if is_error else "message": line,
                }
            )

        logger.info("Publishing completion message")
        await publish_response(
            {
                "status": "completed",
                "run_id": run_id,
                "command": command,
                "macro_name": macro_name,
                "is_last": is_last,
                "message": f"Command finished with exit code {returncode}",
                "exit_code": returncode,
            }
        )
        logger.info("Completion message published")

    except asyncio.CancelledError:
        if task_manager.current_process:
            try:
                pgid = os.getpgid(task_manager.current_process.pid)
                os.killpg(pgid, signal.SIGKILL)
            except:
                pass
            task_manager.current_process = None
        raise
    except Exception as e:
        await publish_response(
            {
                "status": "error",
                "run_id": run_id,
                "command": command,
                "macro_name": macro_name,
                "is_last": is_last,
                "error": f"Failed to execute command: {str(e)}",
            }
        )
    finally:
        task_manager.current_process = None


async def command_worker():
    logger.info("Command worker started")
    while True:
        try:
            command, macro_name, run_id, is_last = await task_manager.queue.get()
            logger.info(f"Worker picked up command: {command}")
            try:
                await execute_and_stream(command, macro_name, run_id, is_last)
            except asyncio.CancelledError:
                task_manager.queue.task_done()
                raise
            except Exception as e:
                logger.info(f"Worker error: {e}")
            finally:
                task_manager.queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.info(f"Worker queue get error: {e}")
            await asyncio.sleep(1)


async def control_listener():
    while True:
        try:
            r = redis.from_url(REDIS_URL, socket_connect_timeout=5)
            pubsub = r.pubsub()
            await pubsub.subscribe("agent_control")
            logger.info("Subscribed to 'agent_control' channel.")

            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        if data.get("type") == "kill":
                            logger.info("Received KILL command. Resetting agent...")
                            await task_manager.kill_current_task()
                            task_manager.clear_queue()
                            await publish_response(
                                {
                                    "status": "reset",
                                    "command": "",
                                    "message": "Agent tasks killed and queue cleared.",
                                }
                            )
                    except Exception as e:
                        logger.info(f"Error processing control message: {e}")
            await r.aclose()
        except asyncio.CancelledError:
            break
        except redis.ConnectionError as e:
            logger.info(f"Control listener connection error: {e}. Reconnecting...")
            await asyncio.sleep(5)
        except Exception as e:
            logger.info(f"Control listener error: {e}. Reconnecting...")
            await asyncio.sleep(5)


async def command_listener():
    logger.info("Command listener started")
    while True:
        try:
            r = redis.from_url(REDIS_URL, socket_connect_timeout=5)
            result = await r.brpop("agent_commands", timeout=5)
            await r.aclose()

            if result is None:
                continue

            _, raw = result
            data = json.loads(raw)
            command = data.get("command")
            macro_name = data.get("macro_name", "")
            run_id = data.get("run_id") or str(uuid.uuid4())
            is_last = data.get("is_last", True)

            if command:
                logger.info(
                    f"Queuing command: {command} (macro: {macro_name}, run_id: {run_id}, is_last: {is_last})"
                )
                await task_manager.queue.put((command, macro_name, run_id, is_last))

        except asyncio.CancelledError:
            break
        except redis.ConnectionError as e:
            logger.info(f"Command listener connection error: {e}. Reconnecting...")
            await asyncio.sleep(1)
        except redis.TimeoutError:
            continue
        except Exception as e:
            logger.info(f"Error processing command message: {e}")
            await asyncio.sleep(1)


async def run_agent():
    logger.info(f"Agent starting, connecting to Redis at {REDIS_URL}...")

    worker_task = asyncio.create_task(command_worker())
    listener_task = asyncio.create_task(command_listener())
    control_task = asyncio.create_task(control_listener())
    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        await asyncio.gather(worker_task, listener_task, control_task, heartbeat_task)
    except asyncio.CancelledError:
        worker_task.cancel()
        listener_task.cancel()
        control_task.cancel()
        heartbeat_task.cancel()
        await asyncio.gather(
            worker_task,
            listener_task,
            control_task,
            heartbeat_task,
            return_exceptions=True,
        )


if __name__ == "__main__":
    asyncio.run(run_agent())
