import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# Directory to scan
SCAN_DIR = "/mnt/debrid/media/special"
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
    if not os.path.exists(SCAN_DIR):
        print(f"Error: Directory {SCAN_DIR} not found.")
        return

    print(f"Scanning {SCAN_DIR} for broken links...")
    files_to_check = []
    for root, _, files in os.walk(SCAN_DIR):
        for f in files:
            files_to_check.append(os.path.join(root, f))

    total_files = len(files_to_check)
    print(f"Found {total_files} files. Verifying integrity with {MAX_WORKERS} workers...")

    broken_count = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_file = {executor.submit(verify_link, f): f for f in files_to_check}
        
        for future in as_completed(future_to_file):
            result = future.result()
            if result:
                path, status, msg = result
                print(f"[{status}] {path} -> {msg}")
                broken_count += 1

    print("-" * 40)
    print(f"Scan complete. Checked {total_files} files.")
    if broken_count > 0:
        print(f"FAILED: Found {broken_count} broken or unreadable links.")
    else:
        print("SUCCESS: All links are healthy.")

if __name__ == "__main__":
    main()
