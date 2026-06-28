# Yato Easing - dev install
# Links this dev folder into %APPDATA%\Adobe\CEP\extensions via a Directory Junction
# and enables PlayerDebugMode so the unsigned CEP extension loads.
# No admin rights required (HKCU / user area only).
# NOTE: ASCII-only on purpose so it runs under both Windows PowerShell 5.1 and pwsh 7.

$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$extId  = "com.yato.easing"
$target = Join-Path $env:APPDATA "Adobe\CEP\extensions\$extId"
$extDir = Split-Path $target -Parent

# 1) Ensure the extensions folder exists
if (-not (Test-Path $extDir)) {
    New-Item -ItemType Directory -Force -Path $extDir | Out-Null
}

# 2) Remove existing link/folder, then (re)create the Junction
if (Test-Path $target) {
    $item = Get-Item $target -Force
    if ($item.LinkType -eq "Junction") {
        Remove-Item $target -Force
    } else {
        Write-Warning "A non-link item already exists: $target"
        Write-Warning "Please check/remove it manually. Aborting."
        exit 1
    }
}
New-Item -ItemType Junction -Path $target -Target $source | Out-Null
Write-Host "Junction created: $target -> $source" -ForegroundColor Green

# 3) Enable PlayerDebugMode (cover CSXS 10/11/12)
foreach ($v in 10, 11, 12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -Type String
    Write-Host "PlayerDebugMode=1 set on CSXS.$v" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Restart After Effects, then open Window > Extensions > Yato Easing." -ForegroundColor Cyan
