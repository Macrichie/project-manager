#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required. Install Docker first.' >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
docker compose -f "$script_dir/../compose.yaml" down
echo 'Forma stopped. Saved board data is preserved.'
