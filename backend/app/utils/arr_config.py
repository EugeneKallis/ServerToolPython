import json
from sqlalchemy.orm import Session
from ..models import ArrInstance
import redis.asyncio as aioredis

async def broadcast_arr_config(r: aioredis.Redis, db: Session):
    instances = db.query(ArrInstance).all()
    data = [{
        "id": i.id,
        "name": i.name,
        "type": i.type,
        "url": i.url,
        "api_key": i.api_key,
        "enabled": i.enabled
    } for i in instances]
    await r.publish("arr_config_updates", json.dumps(data))
