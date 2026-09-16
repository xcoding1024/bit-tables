# 交叉编译 Win / macOS / Linux 可执行文件到 dist/
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$saved = @{
    GOOS        = $env:GOOS
    GOARCH      = $env:GOARCH
    CGO_ENABLED = $env:CGO_ENABLED
}

$targets = @(
    @{ GOOS = "windows"; GOARCH = "amd64"; Name = "bit-tables-windows-amd64.exe" }
    @{ GOOS = "darwin";  GOARCH = "amd64"; Name = "bit-tables-darwin-amd64" }
    @{ GOOS = "darwin";  GOARCH = "arm64"; Name = "bit-tables-darwin-arm64" }
    @{ GOOS = "linux";   GOARCH = "amd64"; Name = "bit-tables-linux-amd64" }
    @{ GOOS = "linux";   GOARCH = "arm64"; Name = "bit-tables-linux-arm64" }
)

try {
    $env:CGO_ENABLED = "0"
    foreach ($t in $targets) {
        $env:GOOS = $t.GOOS
        $env:GOARCH = $t.GOARCH
        $out = Join-Path $dist $t.Name
        Write-Host "-> $($t.GOOS)/$($t.GOARCH)  $($t.Name)"
        & go build -trimpath -ldflags="-s -w" -o $out ./cmd/bit-tables
        if ($LASTEXITCODE -ne 0) {
            throw "go build failed: $($t.GOOS)/$($t.GOARCH)"
        }
    }
}
finally {
    if ($null -eq $saved.GOOS) { Remove-Item Env:GOOS -ErrorAction SilentlyContinue } else { $env:GOOS = $saved.GOOS }
    if ($null -eq $saved.GOARCH) { Remove-Item Env:GOARCH -ErrorAction SilentlyContinue } else { $env:GOARCH = $saved.GOARCH }
    if ($null -eq $saved.CGO_ENABLED) { Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue } else { $env:CGO_ENABLED = $saved.CGO_ENABLED }
}

Write-Host ""
Write-Host "done: dist/"
Get-ChildItem $dist | ForEach-Object { "{0,12:N0}  {1}" -f $_.Length, $_.Name }
