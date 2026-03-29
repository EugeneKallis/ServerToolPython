import os
import sys
import argparse
import json as json_mod
from concurrent.futures import ThreadPoolExecutor, as_completed

# Number of concurrent workers
MAX_WORKERS = 20
# Bytes to read to verify content is accessible
BYTES_TO_READ = 1024

def verify_link(path: str):
    """
    Checks if a path is a broken symlink or if its content is unreadable.
    Returns (path, status, error_msg)
    """
    try:
        # 1. Check if it's a symlink
        is_link = os.path.islink(path)
        if not is_link:
            return None # Skip regular files if strictly looking for symlinks

        # 2. Check if the target exists
        target = os.readlink(path)
        if not os.path.exists(path):
            return (path, "BROKEN", f"Points to non-existent: {target}")

        # 3. Try to read content to ensure mount is responsive
        try:
            with open(path, 'rb') as f:
                f.read(BYTES_TO_READ)
        except Exception as e:
            return (path, "UNREADABLE", str(e))

        return None # File is healthy

    except Exception as e:
        return (path, "ERROR", str(e))

def main():
    parser = argparse.ArgumentParser(
        description='Find broken symlinks in a directory.'
    )
    parser.add_argument(
        '--scan-dir', type=str, default=None,
        help='Directory to scan. Falls back to BLF_SCAN_DIR env var, then /mnt/debrid/media/special.'
    )
    parser.add_argument(
        '--json', action='store_true',
        help='Output results as JSON lines (one JSON object per broken link). Suppresses human-readable output.'
    )
    args = parser.parse_args()

    # Resolve scan directory: arg -> env var -> hardcoded default
    scan_dir = args.scan_dir or os.environ.get('BLF_SCAN_DIR') or '/mnt/debrid/media/special'
    use_json = args.json

    if not os.path.exists(scan_dir):
        if not use_json:
            print(f"Error: Directory {scan_dir} not found.")
        return

    if not use_json:
        print(f"Scanning {scan_dir} for broken links...")

    files_to_check = []
    for root, _, files in os.walk(scan_dir):
        for f in files:
            files_to_check.append(os.path.join(root, f))

    total_files = len(files_to_check)
    if not use_json:
        print(f"Found {total_files} files. Verifying integrity with {MAX_WORKERS} workers...")

    broken_count = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_file = {executor.submit(verify_link, f): f for f in files_to_check}

        for future in as_completed(future_to_file):
            result = future.result()
            if result:
                path, status, msg = result
                if use_json:
                    print(json_mod.dumps({"path": path, "status": status, "msg": msg}))
                else:
                    print(f"[{status}] {path} -> {msg}")
                broken_count += 1

    if not use_json:
        print("-" * 40)
        print(f"Scan complete. Checked {total_files} files.")
        if broken_count > 0:
            print(f"FAILED: Found {broken_count} broken or unreadable links.")
        else:
            print("SUCCESS: All links are healthy.")

if __name__ == "__main__":
    main()
