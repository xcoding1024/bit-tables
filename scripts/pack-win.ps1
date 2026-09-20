$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $env:CI) {
  if (-not $env:GOPROXY) { $env:GOPROXY = "https://goproxy.cn,https://goproxy.io,direct" }
  if (-not $env:ELECTRON_MIRROR) { $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/" }
  if (-not $env:ELECTRON_BUILDER_BINARIES_MIRROR) {
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
  }
}

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}
if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
  npm install --prefix frontend
  if ($LASTEXITCODE -ne 0) { throw "frontend npm install failed" }
}

npm run build --prefix frontend
if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }

$runtime = Join-Path $root "dist\runtime"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -trimpath -ldflags="-s -w" -o (Join-Path $runtime "bit-tables.exe") ./cmd/bit-tables
if ($LASTEXITCODE -ne 0) { throw "go build failed" }
Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED -ErrorAction SilentlyContinue

npx electron-builder --win zip --x64
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "Windows package under dist/desktop/"
