$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required. Install and start Docker Desktop, then run this script again.'
}

docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker is not running. Start Docker Desktop, then run this script again.'
}

$composeFile = Join-Path $PSScriptRoot '../compose.yaml'
docker compose -f $composeFile up --build --detach --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Could not start Forma. Check the Docker output above.' }

Write-Host 'Forma is ready at http://127.0.0.1:8000'
