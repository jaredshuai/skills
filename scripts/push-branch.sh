#!/usr/bin/env bash
# Force-pushes the generated dist/ directory as the `skillhub` branch.
# Runs in CI with GH_TOKEN + GITHUB_REPOSITORY + GITHUB_SHA set.
set -euo pipefail
: "${DIST_DIR:=dist}"
: "${BRANCH:=skillhub}"

cd "$DIST_DIR"
SHORTSHA="${GITHUB_SHA:0:7}"
git init -q -b "$BRANCH"
git add -A
git -c user.name="mirror-bot" -c user.email="mirror-bot@users.noreply.github.com" \
  commit -qm "build skillhub artifacts from ${SHORTSHA}"
git remote add origin "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git push -qf origin "$BRANCH"
echo "pushed ${BRANCH} branch (from ${SHORTSHA})"
