# 启动一个带远程调试端口的 Chrome（独立配置目录，不影响日常浏览器）
# 用法: powershell -ExecutionPolicy Bypass -File launch-chrome.ps1 [-Port 9223]

param(
  [int]$Port = 9223,
  [string]$Url = "https://i.chaoxing.com/base"
)

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Error "没找到 Chrome 或 Edge，请先安装其一。"
  exit 1
}

$profile = Join-Path $env:LOCALAPPDATA "chaoxing-skill-profile"
New-Item -ItemType Directory -Force -Path $profile | Out-Null

Start-Process -FilePath $browser -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  "--no-first-run",
  "--no-default-browser-check",
  $Url
)

Start-Sleep -Seconds 4
try {
  $v = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 10
  Write-Host "已启动: $browser"
  Write-Host "调试端口: $Port"
  Write-Host "配置目录: $profile"
  Write-Host "请在该窗口登录学习通，然后运行: node scripts/check-work.mjs"
} catch {
  Write-Error "浏览器已启动，但调试端口 $Port 未就绪。可能是该端口被占用，换个 -Port 再试。"
  exit 2
}
