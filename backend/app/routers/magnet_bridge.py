import os
import re
from typing import Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/magnet-bridge", tags=["magnet-bridge"])

MAGNET_BRIDGE_URL = os.getenv("MAGNET_BRIDGE_URL", "http://magnet-bridge:8081")
MANAGED_CATEGORY = os.getenv("MANAGED_CATEGORY", "special")


@router.post("/add")
async def add_torrent(
    urls: Optional[str] = Form(None),
    files: Optional[UploadFile] = File(None),
    downloadUncached: str = Form("false"),
):
    async with httpx.AsyncClient() as client:
        form_data = {
            "arr": MANAGED_CATEGORY,
            "downloadUncached": downloadUncached,
            "action": "symlink",
            "debrid": "",
            "downloadFolder": "/mnt/debrid/downloads",
        }

        files_data = None
        if urls:
            form_data["urls"] = urls
        elif files:
            files_data = {"files": (files.filename, await files.read(), files.content_type)}
        else:
            raise HTTPException(status_code=400, detail="No magnet link or file provided")

        try:
            target_url = f"{MAGNET_BRIDGE_URL}/api/{MANAGED_CATEGORY}/add"
            resp = await client.post(
                target_url,
                data=form_data,
                files=files_data,
                timeout=30.0,
            )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Magnet Bridge error: {resp.text}",
                )

            return "Submission successful"

        except HTTPException:
            raise
        except Exception as e:
            print(f"[magnet_bridge] Error forwarding to bridge: {e}", flush=True)
            raise HTTPException(status_code=502, detail=f"Failed to contact Magnet Bridge: {str(e)}")
