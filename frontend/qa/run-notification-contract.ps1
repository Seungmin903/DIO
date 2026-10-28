param([string]$BackendRoot)
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-notification-contract.cjs'
if ($BackendRoot) { & node $runner --backend-root $BackendRoot } else { & node $runner }
if ($LASTEXITCODE -ne 0) { throw '알림 계약 검증 실패' }
