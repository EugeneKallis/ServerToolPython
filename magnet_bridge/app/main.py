import asyncio
import os
import re
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Union

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Configuration
DECYPHARR_URL = os.getenv("DECYPHARR_URL", "http://192.168.1.99:8282")
TORRENT_DEST_DIR = os.getenv("TORRENT_DEST_DIR", "/mnt/debrid/media")
MAGNET_BRIDGE_PORT = int(os.getenv("MAGNET_BRIDGE_PORT", "8081"))
MANAGED_CATEGORY = os.getenv("MANAGED_CATEGORY", "special")
DEBUG_SKIP_MOVE = os.getenv("DEBUG_SKIP_MOVE", "false").lower() == "true"

print("--- Magnet Bridge Configuration ---")
print(f"Decypharr URL:    {DECYPHARR_URL}")
print(f"Dest Directory:   {TORRENT_DEST_DIR}")
print(f"Managed Category: {MANAGED_CATEGORY}")
print(f"Debug Skip Move:  {DEBUG_SKIP_MOVE}")
print(f"Port:             {MAGNET_BRIDGE_PORT}")
print("-----------------------------------")


class Torrent(BaseModel):
    id: str
    category: str
    name: str
    state: str
    hash: str
    content_path: str


# Helper functions
def truncate_string(s: str, max_len: int) -> str:
    return s[:max_len] + "..." if len(s) > max_len else s

def extract_hash(magnet_link: str) -> Optional[str]:
    match = re.search(r'xt=urn:btih:([a-zA-Z0-9]+)', magnet_link)
    return match.group(1) if match else None

async def get_torrent_name_by_hash(hash_code: str) -> Optional[str]:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{DECYPHARR_URL}/api/torrents")
            if resp.status_code == 200:
                torrents = resp.json()
                for t in torrents:
                    if t.get("hash", "").lower() == hash_code.lower():
                        return t.get("name")
        except Exception as e:
            print(f"Error fetching torrent name for {hash_code}: {e}")
    return None

def get_dir_size(path: Union[str, Path]) -> int:
    path = Path(path)
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size

    total_size = 0
    for file in path.rglob('*'):
        if file.is_file():
            if file.is_symlink():
                try:
                    target = file.resolve()
                    if target.is_file():
                        total_size += target.stat().st_size
                except Exception:
                    pass
            else:
                total_size += file.stat().st_size
    return total_size

async def cleanup_small_symlinks(dir_path: str, min_size_mb: int = 75):
    min_size_bytes = min_size_mb * 1024 * 1024
    path = Path(dir_path)
    if not path.exists() or not path.is_dir():
        return

    print(f"Cleaning up symlinks in {dir_path} targeting files < {min_size_mb} MB")
    for item in path.rglob('*'):
        if item.is_symlink():
            try:
                target = item.resolve()
                if target.is_file() and target.stat().st_size < min_size_bytes:
                    print(f"Deleting small symlink: {item} (Target Size: {target.stat().st_size} bytes)")
                    item.unlink()
            except Exception as e:
                print(f"Warning: Could not check target of symlink {item}: {e}")

async def resolve_path(path_str: str) -> Optional[str]:
    path = Path(path_str)
    if path.exists():
        return str(path)

    # Fix double category nesting: category/category/Name -> category/Name
    path_parts = list(path.parts)
    if len(path_parts) >= 3 and path_parts[-3] == MANAGED_CATEGORY and path_parts[-2] == MANAGED_CATEGORY:
        fixed_parts = path_parts[:-3] + [MANAGED_CATEGORY] + [path_parts[-1]]
        fixed_path = Path(*fixed_parts)
        if fixed_path.exists():
            return str(fixed_path)

    # Partial match or missing extension in parent dir
    if path.parent.exists():
        base = path.name
        for item in path.parent.iterdir():
            if item.name.startswith(base):
                return str(item)

    return None


# Background Worker
async def poll_torrents():
    print(f"Starting background worker to poll for completed '{MANAGED_CATEGORY}' torrents...")
    failed_torrents = set()

    async with httpx.AsyncClient() as client:
        while True:
            await asyncio.sleep(5)

            try:
                resp = await client.get(f"{DECYPHARR_URL}/api/torrents")
                if resp.status_code != 200:
                    print(f"Error fetching torrents: {resp.status_code}")
                    continue

                torrents = resp.json()
                for t_data in torrents:
                    t = Torrent(**t_data)

                    if t.category != MANAGED_CATEGORY:
                        continue

                    if t.state != "pausedUP" or not t.content_path:
                        continue

                    real_path = await resolve_path(t.content_path)
                    if not real_path:
                        if t.hash not in failed_torrents:
                            print(f"Error locating content path for {t.name} ({t.content_path})")
                            failed_torrents.add(t.hash)
                        continue

                    if t.hash in failed_torrents:
                        failed_torrents.remove(t.hash)
                        print(f"Locating content path for {t.name} resolved: {real_path}")

                    print(f"Processing completed {MANAGED_CATEGORY} torrent: {t.name} ({t.hash})")

                    # Cleanup small symlinks
                    await cleanup_small_symlinks(real_path, 75)

                    should_move = not DEBUG_SKIP_MOVE
                    if DEBUG_SKIP_MOVE:
                        print(f"DEBUG MODE: Skipping move for {t.name}")
                    elif dest_path.exists():
                        new_size = get_dir_size(src_path)
                        old_size = get_dir_size(dest_path)

                        if new_size > old_size:
                            print(f"New content is larger ({new_size} > {old_size}), replacing existing.")
                            if dest_path.is_dir():
                                shutil.rmtree(dest_path)
                            else:
                                dest_path.unlink()
                        else:
                            print(f"Existing content is larger or equal ({old_size} >= {new_size}), keeping existing.")
                            if src_path.is_dir():
                                shutil.rmtree(src_path)
                            else:
                                src_path.unlink()
                            should_move = False

                    if should_move:
                        try:
                            shutil.move(str(src_path), str(dest_path))
                            print(f"Moved completed {MANAGED_CATEGORY} torrent: {t.name} to {dest_path}")
                        except Exception as e:
                            print(f"Error moving {src_path} to {dest_path}: {e}")
                            continue

                    # Remove from UI
                    try:
                        del_resp = await client.delete(f"{DECYPHARR_URL}/api/torrents/{MANAGED_CATEGORY}/{t.hash}")
                        if del_resp.status_code == 200:
                            print(f"Removed {MANAGED_CATEGORY} torrent from UI: {t.hash}")
                        else:
                            print(f"Failed to remove torrent from UI: {t.hash} (Status: {del_resp.status_code})")
                    except Exception as e:
                        print(f"Error sending DELETE request for {t.hash}: {e}")

            except Exception as e:
                print(f"Error in poll_torrents: {e}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(poll_torrents())
    yield
    task.cancel()


app = FastAPI(title="Magnet Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


# Routes
@app.post("/api/{arr}/add")
async def add_torrent(
    arr: str,
    urls: Optional[str] = Form(None),
    files: Optional[UploadFile] = File(None),
    downloadUncached: str = Form("false")
):
    async with httpx.AsyncClient() as client:
        form_data = {
            "arr": arr,
            "downloadUncached": downloadUncached,
            "action": "symlink",
            "debrid": "",
            "downloadFolder": "/mnt/debrid/downloads"
        }

        # Build as multipart fields — httpx always sends multipart/form-data when files= is used
        multipart = [(k, (None, str(v))) for k, v in form_data.items()]

        if urls:
            form_data["urls"] = urls
            multipart.append(("urls", (None, urls)))
        elif files:
            file_bytes = await files.read()
            multipart.append(("files", (files.filename, file_bytes, files.content_type)))
        else:
            raise HTTPException(status_code=400, detail="No magnet link or file provided")

        try:
            resp = await client.post(
                f"{DECYPHARR_URL}/api/add",
                files=multipart,
                timeout=30.0
            )

            if resp.status_code != 200:
                print(f"Decypharr API error ({resp.status_code}): {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Decypharr API error: {resp.text}")

            api_resp = resp.json()
            if api_resp.get("errors"):
                error_msg = "\n".join(api_resp["errors"])
                error_msg = re.sub(r'(URL )?magnet:\?.*?: ', '', error_msg)
                raise HTTPException(status_code=400, detail=f"Decypharr API returned errors: {error_msg}")

            asyncio.create_task(log_success(arr, urls))

            return "Submission successful"
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            print(f"Error forwarding to Decypharr: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to contact Decypharr API: {str(e)}")

async def log_success(arr: str, urls: Optional[str]):
    await asyncio.sleep(0.5)
    if urls:
        hash_code = extract_hash(urls)
        if hash_code:
            name = await get_torrent_name_by_hash(hash_code)
            if name:
                print(f"Processed submission: {name} ({hash_code})")
                return
    print(f"Processed submission for {arr}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=MAGNET_BRIDGE_PORT)
