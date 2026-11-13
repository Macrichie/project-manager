#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required. Install and start Docker, then run this script again.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker is not running. Start Docker, then run this script again.' >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
docker compose -f "$script_dir/../compose.yaml" up --build --detach --wait --wait-timeout 120
echo 'Forma is ready at http://127.0.0.1:8000'
