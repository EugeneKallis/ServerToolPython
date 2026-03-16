#!/bin/bash
echo "Hello from the Agent's script directory!"
echo "Current User: $(whoami)"
echo "Kernel Info: $(uname -a)"
echo "Mount Status of /mnt:"
ls -d /mnt
echo "Accessing /mnt/debrid (Proof of Work):"
ls -ld /mnt/debrid || echo "Still no access to /mnt/debrid"
