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
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'member-development-preflight.ps1') -Destination $fixtureQa
$priorJavaHome=$env:JAVA_HOME
$env:JAVA_HOME=Join-Path $fixture 'jdk'
New-Item -ItemType Directory -Force -Path (Join-Path $env:JAVA_HOME 'bin') | Out-Null
New-Item -ItemType File -Path (Join-Path $env:JAVA_HOME 'bin/java.exe') | Out-Null
$initMock=Join-Path $mockBin 'initdb.ps1'
$ctlMock=Join-Path $mockBin 'pg_ctl.ps1'
New-Item -ItemType File -Path (Join-Path $mockBin 'postgres.exe') | Out-Null
$createdb=Join-Path $mockBin 'createdb.exe'
New-Item -ItemType File -Path $createdb | Out-Null
$timezoneDir=Join-Path (Split-Path $mockBin) 'share/timezonesets'
New-Item -ItemType Directory -Force -Path $timezoneDir | Out-Null
New-Item -ItemType File -Path (Join-Path $timezoneDir 'Default') | Out-Null
@'
if ($env:DIO_TEST_INITDB_FAIL -eq 'true') { $global:LASTEXITCODE=1; return }
$directory=$args[[Array]::IndexOf($args,'-D')+1]
New-Item -ItemType Directory -Force -Path $directory | Out-Null
Set-Content -LiteralPath (Microsoft.PowerShell.Management\Join-Path $directory 'PG_VERSION') -Value '17'
$global:LASTEXITCODE=0
'@ | Set-Content -LiteralPath $initMock
@'
if ($env:DIO_TEST_DATABASE_READY -eq 'true') { $global:LASTEXITCODE=0; return }
throw 'TEST_REACHED_CLUSTER_START'
'@ | Set-Content -LiteralPath $ctlMock
$psqlMock=Join-Path $mockBin 'psql.ps1'
@'
if (($args -join ' ') -like '*to_regclass*') {
    if ($env:DIO_TEST_LEGACY_HISTORY -eq 'true') { Write-Output 't' } else { Write-Output 'f' }
} elseif (($args -join ' ') -like '*from flyway_schema_history*') { Write-Output '2' }
else { Write-Output '1' }
$global:LASTEXITCODE=0
'@ | Set-Content -LiteralPath $psqlMock
$gradleMock=Join-Path (Split-Path $fixtureQa) 'gradlew.bat'
[IO.File]::WriteAllText($gradleMock,"@echo off`r`necho invoked>gradle-invoked.txt`r`nexit /b 1`r`n")
function Join-Path {
    param([string]$Path,[string]$ChildPath)
    if ($Path -eq $mockBin -and $ChildPath -eq 'initdb.exe') { return $initMock }
    if ($Path -eq $mockBin -and $ChildPath -eq 'pg_ctl.exe') { return $ctlMock }
    if ($Path -eq $mockBin -and $ChildPath -eq 'psql.exe') { return $psqlMock }
    Microsoft.PowerShell.Management\Join-Path -Path $Path -ChildPath $ChildPath
}
function Expect-Failure([string]$message) {
    $before=@{}
    Get-ChildItem Env: | ForEach-Object { $before[$_.Name]=$_.Value }
    try { & $startup -PostgresBin $mockBin; throw 'Expected startup to stop' }
    catch { if (!$_.Exception.Message.Contains($message)) { throw } }
    $keys=@('PGPASSWORD')
    $envFile=Microsoft.PowerShell.Management\Join-Path $fixture 'repo/.local-data/member-app/backend.env'
    if(Test-Path -LiteralPath $envFile) {
        $keys+=Get-Content -LiteralPath $envFile | ForEach-Object { if($_ -match '^([A-Z0-9_]+)=') { $Matches[1] } }
    }
    foreach($key in $keys) {
        if([Environment]::GetEnvironmentVariable($key,'Process') -cne $before[$key]) {
            throw "Startup failed to restore caller environment: $key"
        }
    }
}
function Get-CimInstance {
    param($ClassName,$Filter,$ErrorAction)
    if ($ClassName -ne 'Win32_Process' -or $Filter -ne "ProcessId = $PID") { throw 'Unexpected process inspection' }
    $jar=Microsoft.PowerShell.Management\Join-Path $fixture 'repo/backend/build/libs/app.jar'
    switch ($env:DIO_TEST_PROCESS_SCENARIO) {
        'gone' { return $null }
        'foreign' { return [pscustomobject]@{ Name='java.exe'; CommandLine='java -jar C:\another-checkout\backend\build\libs\app.jar' } }
        'nonjava' { return [pscustomobject]@{ Name='pwsh.exe'; CommandLine='pwsh' } }
        'nearpath' { return [pscustomobject]@{ Name='java.exe'; CommandLine=('java -jar "'+(Split-Path $jar)+'-other\app.jar"') } }
        'plain' { return [pscustomobject]@{ Name='java.exe'; CommandLine=('java -jar "'+$jar.Replace('app.jar','app-plain.jar')+'"') } }
        'nojar' { return [pscustomobject]@{ Name='java.exe'; CommandLine='java -version' } }
        'unknown' { return [pscustomobject]@{ Name='java.exe'; CommandLine=$null } }
        'denied' { throw 'mock inspection denied' }
        default { return [pscustomobject]@{ Name='java.exe'; CommandLine=('"C:\Java\java.exe" -jar "'+$jar+'"') } }
    }
}
$runtimeDir=Join-Path $fixture 'repo/.local-data/member-app'
try {
    $legacyShell=Get-Command powershell.exe -ErrorAction SilentlyContinue
    if ($legacyShell) {
        foreach($target in @($startup,(Join-Path $fixtureQa 'member-development-preflight.ps1'))) {
            # Process-only policy override lets this isolated fixture reach the
            # version guard; no persistent execution policy is changed.
            $arguments=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$target)
            if($target -eq $startup) { $arguments+=@('-PostgresBin',$mockBin) }
            $output=(& $legacyShell.Source @arguments 2>&1 | Out-String)
            if($LASTEXITCODE -eq 0 -or $output -notmatch '7\.0') { throw 'Windows PowerShell must fail with the explicit version requirement' }
            if(Test-Path $runtimeDir) { throw 'Unsupported PowerShell changed runtime files' }
        }
        Write-Output 'PASS: Windows PowerShell 5.1 rejects both scripts before runtime changes'
    } else { Write-Output 'SKIP: Windows PowerShell version rejection (powershell.exe unavailable)' }
    $testJavaHome=$env:JAVA_HOME
    $env:JAVA_HOME=''
    Expect-Failure 'JAVA_HOME is required'
    if (Test-Path $runtimeDir) { throw 'Missing JAVA_HOME changed runtime files' }
    Write-Output 'PASS: missing JAVA_HOME stops before runtime initialization'
    $env:JAVA_HOME=Join-Path $fixture 'missing-jdk'
    Expect-Failure 'JAVA_HOME must contain'
    if (Test-Path $runtimeDir) { throw 'Invalid JAVA_HOME changed runtime files' }
    Write-Output 'PASS: invalid JAVA_HOME stops before runtime initialization'
    $env:JAVA_HOME=$testJavaHome
    # Missing createdb must not initialize a cluster or persist private settings.
    Remove-Item -LiteralPath $createdb
    Expect-Failure 'Incomplete PostgreSQL installation'
    if ((Test-Path (Join-Path $runtimeDir 'backend.env')) -or (Test-Path (Join-Path $runtimeDir 'runtime.json')) `
        -or @(Get-ChildItem -LiteralPath (Split-Path $mockBin) -Directory -Filter 'member-app-*').Count) {
        throw 'Missing createdb changed runtime configuration or initialized a cluster'
    }
    New-Item -ItemType File -Path $createdb | Out-Null
    Write-Output 'PASS: missing createdb stops before initdb and private configuration persistence'
    $env:DIO_TEST_INITDB_FAIL='true'
    Expect-Failure 'initdb failed'
    if ((Test-Path (Join-Path $runtimeDir 'backend.env')) -or (Test-Path (Join-Path $runtimeDir 'runtime.json'))) {
        throw 'Failed initdb must not persist runtime configuration'
    }
    Write-Output 'PASS: initdb failure leaves no persisted runtime configuration'
    $env:DIO_TEST_INITDB_FAIL='false'
    $priorProbePassword=$env:PGPASSWORD
    try {
        $env:PGPASSWORD='caller-environment-preservation-probe'
        Expect-Failure 'TEST_REACHED_CLUSTER_START'
    } finally {
        if($null -eq $priorProbePassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD=$priorProbePassword }
    }
    if (!(Test-Path (Join-Path $runtimeDir 'backend.env'))) { throw 'Successful initdb must persist configuration' }
    $metadata=Get-Content -LiteralPath (Join-Path $runtimeDir 'runtime.json') -Raw | ConvertFrom-Json
    if (!(Test-Path (Join-Path $metadata.dataDir 'PG_VERSION'))) { throw 'Cluster must precede metadata' }
    Write-Output 'PASS: retry initializes cluster before persisting configuration'
    $beforeEnv=(Get-FileHash -LiteralPath (Join-Path $runtimeDir 'backend.env')).Hash
    $beforeMetadata=(Get-FileHash -LiteralPath (Join-Path $runtimeDir 'runtime.json')).Hash
    Remove-Item -LiteralPath $createdb
    Expect-Failure 'Incomplete PostgreSQL installation'
    if ((Get-FileHash -LiteralPath (Join-Path $runtimeDir 'backend.env')).Hash -ne $beforeEnv `
        -or (Get-FileHash -LiteralPath (Join-Path $runtimeDir 'runtime.json')).Hash -ne $beforeMetadata `
        -or !(Test-Path (Join-Path $metadata.dataDir 'PG_VERSION'))) { throw 'Missing createdb changed recorded runtime' }
    New-Item -ItemType File -Path $createdb | Out-Null
    Write-Output 'PASS: missing createdb preserves existing cluster and private configuration'
    $env:DIO_TEST_DATABASE_READY='true'
    $env:DIO_TEST_LEGACY_HISTORY='true'
    Expect-Failure 'Legacy member V7/V8 history detected'
    if (Test-Path (Join-Path (Split-Path $fixtureQa) 'gradle-invoked.txt')) { throw 'Legacy history must stop before build' }
    Write-Output 'PASS: legacy history stops before build without automatic repair'
    Remove-Item Env:DIO_TEST_LEGACY_HISTORY
    # A live PID must stop before attempting to build a possibly locked jar.
    $metadata | Add-Member -NotePropertyName backendPid -NotePropertyValue $PID
    $metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'runtime.json')
    $env:DIO_TEST_DATABASE_READY='true'
    Expect-Failure 'Owned backend is already running'
    if (Test-Path (Join-Path (Split-Path $fixtureQa) 'gradle-invoked.txt')) { throw 'Build ran before live-backend guard' }
    if (!(Get-Process -Id $PID)) { throw 'Live process was not preserved' }
    Write-Output 'PASS: live backend PID stops before build and preserves the process'
    $marker=Join-Path (Split-Path $fixtureQa) 'gradle-invoked.txt'
    foreach ($scenario in @('foreign','nonjava','gone','nearpath','plain','nojar')) {
        $env:DIO_TEST_PROCESS_SCENARIO=$scenario
        Expect-Failure 'bootJar failed'
        if (!(Test-Path $marker)) { throw 'Unrelated or stale PID blocked the build' }
        Remove-Item -LiteralPath $marker
        if (!(Get-Process -Id $PID)) { throw 'Unrelated process was not preserved' }
        Write-Output "PASS: $scenario PID does not block startup or stop the process"
    }
    foreach ($scenario in @('unknown','denied')) {
        $env:DIO_TEST_PROCESS_SCENARIO=$scenario
        Expect-Failure 'Cannot inspect'
        if (Test-Path $marker) { throw 'Unverifiable ownership must stop before build' }
        Write-Output "PASS: $scenario ownership fails clearly before build"
    }
    Remove-Item Env:DIO_TEST_PROCESS_SCENARIO
    Remove-Item Env:DIO_TEST_DATABASE_READY
    $metadata.PSObject.Properties.Remove('backendPid')
    $metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'runtime.json')
    Remove-Item -LiteralPath (Join-Path $metadata.dataDir 'PG_VERSION')
    Expect-Failure 'Owned PostgreSQL cluster is incomplete'
    if (!(Test-Path (Join-Path $runtimeDir 'backend.env'))) { throw 'Incomplete cluster configuration must be preserved for recovery' }
    Write-Output 'PASS: incomplete recorded cluster fails clearly and preserves configuration'
} finally {
    $env:JAVA_HOME=$priorJavaHome
    Remove-Item Env:DIO_TEST_INITDB_FAIL,Env:DIO_TEST_DATABASE_READY,Env:DIO_TEST_PROCESS_SCENARIO,Env:DIO_TEST_LEGACY_HISTORY -ErrorAction SilentlyContinue
    $resolved=[IO.Path]::GetFullPath($fixture)
    $allowed=[IO.Path]::GetFullPath((Microsoft.PowerShell.Management\Join-Path $repoRoot '.local-data'))+[IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
