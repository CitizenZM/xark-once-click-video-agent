# EXPERIMENTAL and not yet tested on a real Windows machine. Run in PowerShell:
#   irm https://raw.githubusercontent.com/CitizenZM/xark-once-click-video-agent/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/CitizenZM/xark-once-click-video-agent"
$src = if ($PSScriptRoot -and (Test-Path "$PSScriptRoot\host\oneclick_host.py")) { $PSScriptRoot } else { "$HOME\.oneclick-downloader" }
if (-not (Test-Path "$src\host\oneclick_host.py")) { git clone --depth 1 $Repo $src }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3 is required: winget install Python.Python.3.12" }
if (-not (Get-Command engine -ErrorAction SilentlyContinue)) { winget install --id engine.engine -e }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { winget install --id Gyan.FFmpeg -e }

$ids = Get-Content "$src\host\EXTENSION_IDS" | Where-Object { $_ -and -not $_.StartsWith("#") }
$origins = '"' + (($ids | ForEach-Object { "chrome-extension://$_/" }) -join '","') + '"'
$bat = ("$src\host\oneclick_host.bat").Replace("\", "\\")
$mf = "$src\host\com.barron.oneclick_dl.json"
Set-Content -Path $mf -Encoding ascii -Value ('{"name":"com.barron.oneclick_dl","description":"One-click downloader","path":"' + $bat + '","type":"stdio","allowed_origins":[' + $origins + ']}')

foreach ($k in "HKCU:\Software\Google\Chrome\NativeMessagingHosts", "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts", "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts") {
  New-Item -Path "$k\com.barron.oneclick_dl" -Force | Out-Null
  Set-ItemProperty -Path "$k\com.barron.oneclick_dl" -Name "(default)" -Value $mf
}
Write-Host "Done. Load the extension (README), then open its dashboard and check for 'Helper ready'."
