#!/bin/bash

php cli.php -plex-url=http://192.168.1.108:32400 -token=Vj_1MsbSyS1zYB_cYxyA

# Add all changes
git add .

# Commit changes with a message including current timestamp
commit_message="chron-scan-$(date +"%Y-%m-%d_%H-%M-%S")"
git commit -m "$commit_message"

# Push changes using the provided access token
git push origin HEAD:main --force --quiet
