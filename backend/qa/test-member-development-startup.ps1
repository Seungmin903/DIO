# Exercises the real startup script with isolated files and mocked PostgreSQL.
# No database or backend process is started.
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$fixture=Join-Path $repoRoot ('.local-data/member-startup-test-'+[guid]::NewGuid().ToString('N'))
$mockBin=Join-Path $fixture 'pgsql/bin'
$fixtureQa=Join-Path $fixture 'repo/backend/qa'
New-Item -ItemType Directory -Force -Path $mockBin,$fixtureQa | Out-Null
$startup=Join-Path $fixtureQa 'start-member-development.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start-member-development.ps1') -Destination $startup
$initMock=Join-Path $mockBin 'initdb.ps1'
$ctlMock=Join-Path $mockBin 'pg_ctl.ps1'
@'
if ($env:DIO_TEST_INITDB_FAIL -eq 'true') { $global:LASTEXITCODE=1; return }
$directory=$args[[Array]::IndexOf($args,'-D')+1]
New-Item -ItemType Directory -Force -Path $directory | Out-Null
Set-Content -LiteralPath (Microsoft.PowerShell.Management\Join-Path $directory 'PG_VERSION') -Value '17'
$global:LASTEXITCODE=0
'@ | Set-Content -LiteralPath $initMock
"throw 'TEST_REACHED_CLUSTER_START'" | Set-Content -LiteralPath $ctlMock
function Join-Path {
    param([string]$Path,[string]$ChildPath)
    if ($Path -eq $mockBin -and $ChildPath -eq 'initdb.exe') { return $initMock }
    if ($Path -eq $mockBin -and $ChildPath -eq 'pg_ctl.exe') { return $ctlMock }
    Microsoft.PowerShell.Management\Join-Path -Path $Path -ChildPath $ChildPath
}
function Expect-Failure([string]$message) {
    try { & $startup -PostgresBin $mockBin; throw 'Expected startup to stop' }
    catch { if (!$_.Exception.Message.Contains($message)) { throw } }
}
$runtimeDir=Join-Path $fixture 'repo/.local-data/member-app'
try {
    $env:DIO_TEST_INITDB_FAIL='true'
    Expect-Failure 'initdb failed'
    if ((Test-Path (Join-Path $runtimeDir 'backend.env')) -or (Test-Path (Join-Path $runtimeDir 'runtime.json'))) {
        throw 'Failed initdb must not persist runtime configuration'
    }
    Write-Output 'PASS: initdb failure leaves no persisted runtime configuration'
    $env:DIO_TEST_INITDB_FAIL='false'
    Expect-Failure 'TEST_REACHED_CLUSTER_START'
    if (!(Test-Path (Join-Path $runtimeDir 'backend.env'))) { throw 'Successful initdb must persist configuration' }
    $metadata=Get-Content -LiteralPath (Join-Path $runtimeDir 'runtime.json') -Raw | ConvertFrom-Json
    if (!(Test-Path (Join-Path $metadata.dataDir 'PG_VERSION'))) { throw 'Cluster must precede metadata' }
    Write-Output 'PASS: retry initializes cluster before persisting configuration'
    Remove-Item -LiteralPath (Join-Path $metadata.dataDir 'PG_VERSION')
    Expect-Failure 'Owned PostgreSQL cluster is incomplete'
    if (!(Test-Path (Join-Path $runtimeDir 'backend.env'))) { throw 'Incomplete cluster configuration must be preserved for recovery' }
    Write-Output 'PASS: incomplete recorded cluster fails clearly and preserves configuration'
} finally {
    Remove-Item Env:DIO_TEST_INITDB_FAIL -ErrorAction SilentlyContinue
    $resolved=[IO.Path]::GetFullPath($fixture)
    $allowed=[IO.Path]::GetFullPath((Microsoft.PowerShell.Management\Join-Path $repoRoot '.local-data'))+[IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
