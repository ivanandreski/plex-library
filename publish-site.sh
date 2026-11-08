#!/bin/sh
set -e
cd "$(dirname "$0")"

./scan.sh

git config --global user.name "$GIT_AUTHOR_NAME"
git config --global user.email "$GIT_AUTHOR_EMAIL"

git add .
git commit -m "chron-scan-$(date +"%Y-%m-%d_%H-%M-%S")"

git remote set-url origin "https://${GITHUB_TOKEN}@github.com/ivanandreski/plex-library.git"
git push origin HEAD:main --force --quiet
