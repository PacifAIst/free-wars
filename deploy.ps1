# Publishes the game to https://free-wars.pages.dev
# Run from PowerShell in this folder:  .\deploy.ps1
# The first time, Cloudflare may open your browser to log in: click Allow.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Getting the latest version from GitHub...' -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) { Write-Host 'git pull failed.' -ForegroundColor Red; exit 1 }

Write-Host 'Installing packages...' -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { Write-Host 'npm ci failed.' -ForegroundColor Red; exit 1 }

Write-Host 'Building...' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host 'Build failed: nothing was published.' -ForegroundColor Red; exit 1 }

Write-Host 'Publishing to Cloudflare...' -ForegroundColor Cyan
npx --yes wrangler@4 pages deploy dist --project-name free-wars --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { Write-Host 'Publishing failed. Try: npx wrangler login' -ForegroundColor Red; exit 1 }

Write-Host 'Done: https://free-wars.pages.dev' -ForegroundColor Green
