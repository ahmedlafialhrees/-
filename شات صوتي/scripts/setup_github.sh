#!/usr/bin/env bash
set -e
# usage: ./scripts/setup_github.sh <YOUR_GITHUB_REPO_URL>
REPO_URL="$1"
if [ -z "$REPO_URL" ]; then echo "Usage: $0 <repo_url>"; exit 1; fi
git init
git add .
git commit -m "Initial StageChat ready repo"
git branch -M main
git remote add origin "$REPO_URL"
git push -u origin main
echo "Pushed to $REPO_URL"