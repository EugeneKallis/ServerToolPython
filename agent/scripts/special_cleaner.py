#!/usr/bin/env python3
"""
special_cleaner.py — Cleans up "special" media directories.

Operations (in order):
  1. Delete archive files (.zip, .rar)
  2. Delete files smaller than --min-size-mb (default: 75 MB)
  3. Delete empty subdirectories

Directories are filtered to only those whose base name is "special".

Usage:
  python special_cleaner.py --dirs /mnt/rdtclient/special /mnt/usenet/special
  python special_cleaner.py --dirs /mnt/media/special --dry-run --min-size-mb 100
  python special_cleaner.py  # reads MEDIA_DIRECTORIES env var (colon-separated paths)
"""

import argparse
import os
import sys

ARCHIVE_EXTENSIONS = {'.zip', '.rar'}


def human_readable_size(size_bytes: int) -> str:
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if abs(size_bytes) < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def get_special_directories(dirs: list[str]) -> list[str]:
    return [d for d in dirs if os.path.basename(d.rstrip('/\\')) == 'special']


def delete_archives(dirs: list[str], dry_run: bool) -> int:
    print("--- Deleting archives ---")
    total_deleted = 0

    for d in dirs:
        for root, _, filenames in os.walk(d):
            for name in filenames:
                if os.path.splitext(name)[1].lower() in ARCHIVE_EXTENSIONS:
                    path = os.path.join(root, name)
                    try:
                        size = os.path.getsize(path)
                    except OSError:
                        size = 0
                    print(f"Deleting {path} ({human_readable_size(size)})")
                    if not dry_run:
                        try:
                            os.remove(path)
                            total_deleted += size
                        except OSError as e:
                            print(f"  Error: {e}")

    print(f"Archives deleted: {human_readable_size(total_deleted)}\n")
    return total_deleted


def delete_small_files(dirs: list[str], min_size_mb: int, dry_run: bool) -> int:
    print(f"--- Deleting files smaller than {min_size_mb} MB ---")
    min_size = min_size_mb * 1024 * 1024
    total_deleted = 0

    for d in dirs:
        for root, _, filenames in os.walk(d):
            for name in filenames:
                path = os.path.join(root, name)
                try:
                    size = os.path.getsize(path)
                except OSError as e:
                    print(f"  Error stating {path}: {e}")
                    continue
                if size < min_size:
                    print(f"Deleting {path} ({human_readable_size(size)})")
                    if not dry_run:
                        try:
                            os.remove(path)
                            total_deleted += size
                        except OSError as e:
                            print(f"  Error: {e}")

    print(f"Small files deleted: {human_readable_size(total_deleted)}\n")
    return total_deleted


def delete_empty_directories(dirs: list[str], dry_run: bool) -> None:
    """Walk bottom-up so newly emptied parents are caught in the same pass."""
    print("--- Deleting empty directories ---")
    root_set = set(os.path.realpath(d) for d in dirs)

    for d in dirs:
        for root, dirnames, filenames in os.walk(d, topdown=False):
            real_root = os.path.realpath(root)
            if real_root in root_set:
                continue
            if not os.listdir(root):
                print(f"Deleting empty directory: {root}")
                if not dry_run:
                    try:
                        os.rmdir(root)
                    except OSError as e:
                        print(f"  Error: {e}")

    print()


def main():
    parser = argparse.ArgumentParser(
        description='Clean up "special" media directories: remove archives, small files, and empty dirs.'
    )
    parser.add_argument(
        '--dirs', nargs='+', metavar='DIR',
        help='Directories to operate on (only those named "special" are used). '
             'Falls back to MEDIA_DIRECTORIES env var (colon-separated).'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Print what would be deleted without actually deleting anything.'
    )
    parser.add_argument(
        '--min-size-mb', type=int, default=75,
        help='Delete files smaller than this threshold in MB (default: 75).'
    )
    args = parser.parse_args()

    # Resolve directory list
    dirs = args.dirs or []
    if not dirs:
        env_val = os.environ.get('MEDIA_DIRECTORIES', '')
        dirs = [d.strip() for d in env_val.split(':') if d.strip()]
    if not dirs:
        print("Error: no directories provided. Use --dirs or set MEDIA_DIRECTORIES (colon-separated).")
        sys.exit(1)

    special_dirs = get_special_directories(dirs)
    if not special_dirs:
        print(f"No directories named 'special' found in: {dirs}")
        sys.exit(0)

    if args.dry_run:
        print("===== DRY RUN — no files will be deleted =====\n")

    print(f"Target directories: {special_dirs}\n")

    total = 0
    total += delete_archives(special_dirs, args.dry_run)
    total += delete_small_files(special_dirs, args.min_size_mb, args.dry_run)
    delete_empty_directories(special_dirs, args.dry_run)

    print(f"Total space freed: {human_readable_size(total)}")


if __name__ == '__main__':
    main()
