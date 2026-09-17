# 跨平台导表入口（Windows PowerShell / pwsh）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path "node_modules")) {
  npm install
}
node export.mjs @args
exit $LASTEXITCODE
