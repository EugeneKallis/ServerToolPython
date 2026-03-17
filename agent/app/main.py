import asyncio
import os
import redis.asyncio as redis
import json

async def execute_and_stream(command: str, r: redis.Redis):
    # Send start message
    await r.publish("agent_responses", json.dumps({
        "status": "started",
        "command": command,
        "message": "Starting execution..."
    }))
    
    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
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

async def command_worker(queue: asyncio.Queue, r: redis.Redis):
    while True:
        command = await queue.get()
        try:
            await execute_and_stream(command, r)
        except Exception as e:
            print(f"Worker error: {e}")
        finally:
            queue.task_done()

async def run_agent():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    print(f"Agent starting, connecting to Redis at {redis_url}...")
    
    r = redis.from_url(redis_url)
    pubsub = r.pubsub()
    
    # Start the worker task to process commands sequentially
    queue = asyncio.Queue()
    asyncio.create_task(command_worker(queue, r))
    
    # Subscribe to commands channel
    await pubsub.subscribe("agent_commands")
    print("Subscribed to 'agent_commands' channel. Waiting for commands...", flush=True)
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                command = data.get("command")
                if command:
                    print(f"Queuing command: {command}", flush=True)
                    # Add to queue instead of processing concurrently
                    await queue.put(command)
            except Exception as e:
                print(f"Error processing message: {e}", flush=True)

if __name__ == "__main__":
    asyncio.run(run_agent())
    print("Auto-reload test successful!")
