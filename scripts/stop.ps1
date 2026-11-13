$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required. Install Docker Desktop first.'
}

$composeFile = Join-Path $PSScriptRoot '../compose.yaml'
docker compose -f $composeFile down
if ($LASTEXITCODE -ne 0) { throw 'Could not stop Forma. Check that Docker Desktop is running.' }

Write-Host 'Forma stopped. Saved board data is preserved.'
