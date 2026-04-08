import os
import redis

def get_redis_client():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(redis_url, socket_connect_timeout=5, socket_timeout=5)
