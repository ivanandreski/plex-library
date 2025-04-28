#!/bin/bash

php cli.php -plex-url=${PLEX_ADDRESS} -token=${PLEX_TOKEN}

git config --global user.name "$GIT_AUTHOR_NAME"
git config --global user.email "$GIT_AUTHOR_EMAIL"

# Add all changes
git add .

# Commit changes with a message including current timestamp
commit_message="chron-scan-$(date +"%Y-%m-%d_%H-%M-%S")"
git commit -m "$commit_message"

# Push changes using the provided access token
echo $GITHUB_TOKEN
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/ivanandreski/plex-library.git"
git push origin HEAD:main --force --quiet
