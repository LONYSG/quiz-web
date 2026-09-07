# =============================================================================
# Q-53 검증: cloudflared 네트워크 단절 시 터널 URL 유지 여부
#
# 목적
#   서버 PC의 네트워크가 1~2분 끊겼다 붙었을 때 같은 터널 URL이 유지되는가.
#   유지되면 친구들의 세션 쿠키까지 살아 있어 재로그인 없이 "재개"만 누르면 되고,
#   바뀌면 새 링크를 뿌리고 전원이 다시 로그인해야 한다.
#   → docs/11-DEPLOY.md 3장의 복구 절차가 이 결과에 달려 있다.
#
# 방식
#   ★ PC 전체 네트워크를 끊지 않는다. cloudflared.exe 의 아웃바운드만 방화벽으로 차단한다.
#     전체 네트워크를 끊으면 작업 환경이 마비된다.
#
# ★★ 방화벽 규칙은 반드시 제거되어야 한다.
#   남겨 두면 다음에 터널이 뜨지 않는다.
#   try/finally 로 감싸고, 스크립트가 중간에 죽어도 규칙이 남지 않게 한다.
#   종료 후 Get-NetFirewallRule 로 제거를 재확인한다.
#
# 한계
#   방화벽 차단은 Wi-Fi를 실제로 끄는 것과 완전히 같지 않다. OS 네트워크 스택 상태가 다르다.
#   (인터페이스가 살아 있고 라우팅 테이블도 그대로다)
#   여기서 URL이 유지되면 실제 상황에서도 유지될 가능성이 높다는 정도로 해석한다.
#
# 실행: 관리자 권한 PowerShell 에서
#   powershell -ExecutionPolicy Bypass -File scripts/verify-tunnel-resilience.ps1
# =============================================================================

param(
  [int]$BlockSeconds = 100,
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$RuleName = 'QUIZWEB-TEST-block-cloudflared-outbound'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Result($k, $v) { Write-Host ("  {0,-34} {1}" -f $k, $v) }

# ── 관리자 권한 확인
$principal = New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host '관리자 권한이 필요합니다. 방화벽 규칙을 만들 수 없습니다.' -ForegroundColor Red
  exit 1
}

# ── 사전 정리: 이전 실행에서 남은 규칙이 있으면 지운다
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Host "이전 실행의 잔여 규칙을 제거합니다: $($_.DisplayName)" -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
  }

# ── cloudflared 경로와 프로세스 확인
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host 'cloudflared 프로세스가 없습니다. 먼저 npm run dev:tunnel 로 터널을 띄우세요.' -ForegroundColor Red
  exit 1
}
$cfPath = ($cf | Select-Object -First 1).Path
$cfPid  = ($cf | Select-Object -First 1).Id

Write-Step 'B-1 기준 상태'
Write-Result 'cloudflared PID' $cfPid
Write-Result 'cloudflared 경로' $cfPath

# 터널 URL 은 호출자가 파일로 넘겨준다 (스크립트가 로그를 파싱하지 않는다)
$urlFile = Join-Path $Root 'tmp\tunnel_url.txt'
if (-not (Test-Path $urlFile)) {
  Write-Host "터널 URL 파일이 없습니다: $urlFile" -ForegroundColor Red
  Write-Host '터널을 띄운 뒤 URL을 그 파일에 적어 주세요.' -ForegroundColor Red
  exit 1
}
$url = (Get-Content $urlFile -Raw).Trim()
Write-Result '터널 URL' $url

function Test-Health($u, $label) {
  try {
    $r = Invoke-WebRequest -Uri "$u/healthz" -TimeoutSec 20 -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Result "$label status" $r.StatusCode
    Write-Result "$label bootedAt" $j.bootedAt
    return $j.bootedAt
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Result "$label status" ($(if ($code) { $code } else { "실패: $($_.Exception.Message)" }))
    return $null
  }
}

$bootedBefore = Test-Health $url '차단 전'
if (-not $bootedBefore) {
  Write-Host '기준 상태 확보 실패. 서버와 터널이 정상인지 확인하세요.' -ForegroundColor Red
  exit 1
}

# ── B-2 차단 / 복구 (반드시 finally 로 제거)
try {
  Write-Step "B-2 cloudflared 아웃바운드 차단 ($BlockSeconds 초)"
  New-NetFirewallRule -DisplayName $RuleName `
    -Direction Outbound -Action Block -Program $cfPath `
    -Profile Any -Enabled True | Out-Null
  Write-Result '방화벽 규칙 생성' $RuleName

  Start-Sleep -Seconds 5
  Write-Step '차단 중 상태'
  $cfAlive = Get-Process -Id $cfPid -ErrorAction SilentlyContinue
  Write-Result '(1) cloudflared 프로세스' ($(if ($cfAlive) { '살아 있음' } else { '★ 죽음' }))
  Test-Health $url '차단 중' | Out-Null

  $remain = $BlockSeconds - 5
  Write-Host "  ... $remain 초 더 유지" -ForegroundColor DarkGray
  Start-Sleep -Seconds $remain

  Write-Step '차단 만료 직전 상태'
  $cfAlive2 = Get-Process -Id $cfPid -ErrorAction SilentlyContinue
  Write-Result 'cloudflared 프로세스' ($(if ($cfAlive2) { '살아 있음' } else { '★ 죽음' }))
}
finally {
  # ★★ 어떤 경우에도 규칙을 제거한다
  Write-Step '방화벽 규칙 제거 (finally)'
  Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
  $left = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
  Write-Result '규칙 잔존 여부' ($(if ($left) { '★★ 남아 있음 — 수동 제거 필요' } else { '제거됨 (정상)' }))
}

# ── B-3 복구 후 확인
Write-Step 'B-3 복구 후 확인 (재연결 대기 45초)'
Start-Sleep -Seconds 45

$cfAlive3 = Get-Process -Id $cfPid -ErrorAction SilentlyContinue
Write-Result '(1) cloudflared 프로세스' ($(if ($cfAlive3) { "살아 있음 (PID $cfPid)" } else { '★ 죽음' }))

$bootedAfter = Test-Health $url '(2) 복구 후 같은 URL'
if ($bootedAfter) {
  Write-Host '  ★★ 같은 URL로 접속 성공 — URL이 유지되었다' -ForegroundColor Green
} else {
  Write-Host '  ★★ 같은 URL로 접속 실패 — URL이 바뀌었거나 아직 재연결 중' -ForegroundColor Yellow
}

Write-Result '(4) bootedAt 동일 여부' ($(if ($bootedAfter -eq $bootedBefore) {
  "동일 ($bootedBefore) — 서버 프로세스 무영향" } else { "★ 다름: $bootedBefore -> $bootedAfter" }))

Write-Step '완료'
Write-Host '(3) WebSocket 재연결과 (5) 로그 패턴은 호출자가 별도로 확인한다.' -ForegroundColor DarkGray
