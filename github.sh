#!/bin/bash

# Navigate to the root of the repository
cd "$(git rev-parse --show-toplevel)" || exit

# Add all changes
git add .

# Commit changes with a message including current timestamp
commit_message="chron-scan-$(date +"%Y-%m-%d_%H-%M-%S")"
git commit -m "$commit_message"

# Push changes using the stored access token
git push origin main
