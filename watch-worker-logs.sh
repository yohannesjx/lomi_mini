#!/bin/bash

# Watch worker logs in real-time
# Shows logs from all moderator-worker containers

set -e

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

echo "👷 Watching Moderator Worker Logs"
echo "=================================="
echo ""
echo "Press Ctrl+C to exit"
echo ""

# Follow logs from all worker containers
docker-compose -f docker-compose.prod.yml --env-file .env.production logs -f moderator-worker

