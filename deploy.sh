#!/bin/bash
set -e

cd "$(dirname "$0")"

git pull --ff-only

# Refresh nginx image
docker compose -p stripboard-editor pull --ignore-buildable

docker compose -p stripboard-editor build --pull

docker compose -p stripboard-editor up -d
docker compose -p stripboard-editor restart nginx

docker image prune -af

docker builder prune -af --filter until=24h
