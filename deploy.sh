#!/bin/bash
set -e

cd "$(dirname "$0")"

# Also runs nightly from cron as backup since Im to stupid to rember running this after each push apperently.
# (thats an issue with all the critical next CVEs)
# never run two deploys at once
exec 9>/tmp/stripboard-deploy.lock
flock -n 9 || { echo "another deploy is running"; exit 1; }

git pull --ff-only

# Refresh nginx image
docker compose -p stripboard-editor pull --ignore-buildable

docker compose -p stripboard-editor build --pull

# Unchanged code and base images = cached build = no container is recreated
app_ids() { docker compose -p stripboard-editor ps -q django nextjs | sort; }
before=$(app_ids)
docker compose -p stripboard-editor up -d

# nginx resolves the django/nextjs upstreams only at startup
if [ "$before" != "$(app_ids)" ]; then
    docker compose -p stripboard-editor restart nginx
fi

docker image prune -af

# Size cap, least recently used goes first: the nightly run keeps its cache (a full rebuild
# would recreate the containers). The 'until' filter removes nothing with Docker 29's containerd store.
docker builder prune -af --max-used-space 5GB
