# =============================================================================
# claude4.ps1 — 원클릭으로 PowerShell 창 4개(Agent · Main · Gen · Verify)를 띄워
#   각 창에서 cd C:\work\quiz-web → claude --dangerously-skip-permissions --resume <그 이름의 최신 세션>
#
#   사용: claude4.bat            (네 창 모두)
#         claude4.bat Gen Verify (고른 창만)
#         claude4.bat -DryRun    (창을 띄우지 않고 어떤 세션을 고를지만 찍는다)
#
#   세션 찾기: ~/.claude/projects/<이 폴더>/*.jsonl 을 최근 수정 순으로 훑어
#   "customTitle":"<이름>" 이 든 첫 파일(= 그 이름으로 /rename 한 가장 최근 세션)의 UUID 로 --resume.
#   없으면 새 세션을 그 이름(--name)으로 연다. 모델은 창마다 고정(docs/16 — 바꾸지 않는다).
# =============================================================================
param(
  [string[]]$Names = @('Agent', 'Main', 'Gen', 'Verify'),
  [switch]$DryRun
)

$repo = Split-Path -Parent $PSScriptRoot            # C:\work\quiz-web
$projKey = ($repo -replace '[:\\\/]', '-')            # C--work-quiz-web
$sessDir = Join-Path $env:USERPROFILE ".claude\projects\$projKey"

$models = @{
  Agent  = 'claude-fable-5-1'
  Main   = 'claude-opus-5-5'
  Gen    = 'claude-opus-5-5'
  Verify = 'claude-sonnet-5-5'
}

function Find-Session([string]$name) {
  if (-not (Test-Path $sessDir)) { return $null }
  $needle = '"customTitle":"' + $name + '"'
  $files = Get-ChildItem -Path $sessDir -Filter *.jsonl -File | Sort-Object LastWriteTime -Descending
  foreach ($f in $files) {
    if (Select-String -Path $f.FullName -SimpleMatch -Pattern $needle -Quiet) {
      return [pscustomobject]@{ Id = $f.BaseName; When = $f.LastWriteTime }
    }
  }
  return $null
}

foreach ($name in $Names) {
  if (-not $models.ContainsKey($name)) { Write-Host "[$name] 모르는 창 이름 — Agent · Main · Gen · Verify 중 하나" -ForegroundColor Yellow; continue }
  $model = $models[$name]
  $s = Find-Session $name
  if ($s) {
    $claudeArgs = "--dangerously-skip-permissions --model $model --resume $($s.Id)"
    Write-Host ("[{0,-6}] resume {1}  ({2:yyyy-MM-dd HH:mm})  {3}" -f $name, $s.Id, $s.When, $model)
  } else {
    $claudeArgs = "--dangerously-skip-permissions --model $model --name $name"
    Write-Host ("[{0,-6}] 세션 없음 → 새로 --name {0}  {1}" -f $name, $model) -ForegroundColor Yellow
  }
  if ($DryRun) { continue }
  $cmd = "`$host.UI.RawUI.WindowTitle = '$name'; Set-Location '$repo'; claude $claudeArgs"
  Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) -WorkingDirectory $repo
  Start-Sleep -Milliseconds 400
}
