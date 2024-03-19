#!/bin/bash

# Check if the access token is provided


# Navigate to the root of the repository
cd "$(git rev-parse --show-toplevel)" || exit

# Add all changes
git add .

# Commit changes with a message including current timestamp
commit_message="chron-scan-$(date +"%Y-%m-%d_%H-%M-%S")"
git commit -m "$commit_message"

# Push changes using the provided access token
git push origin HEAD:main --force --quiet
