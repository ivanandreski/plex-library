#!/bin/bash

# Check if the access token is provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <access_token>"
    exit 1
fi

# Navigate to the root of the repository
cd "$(git rev-parse --show-toplevel)" || exit

# Add all changes
git add .

# Commit changes with a message including current timestamp
commit_message="chron-scan-$(date +"%Y-%m-%d_%H-%M-%S")"
git commit -m "$commit_message"

# Push changes using the provided access token
git push origin HEAD:main --force --quiet "token:$1"
