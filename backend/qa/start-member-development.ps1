param([Parameter(Mandatory=$true)][string]$PostgresBin)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimeDir=Join-Path $repoRoot '.local-data/member-app'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$runtimeFile=Join-Path $runtimeDir 'backend.env'
$metadataFile=Join-Path $runtimeDir 'runtime.json'
function Free-Port([int]$preferred) {
    $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$preferred)
    try { $listener.Start() } catch { $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0); $listener.Start() }
    $port=$listener.LocalEndpoint.Port; $listener.Stop(); return $port
}
if (!(Test-Path -LiteralPath $runtimeFile)) {
    if (!(Test-Path -LiteralPath (Join-Path $PostgresBin 'pg_ctl.exe'))) { throw 'PostgreSQL binaries required' }
    $clusterRoot=Split-Path (Split-Path $PostgresBin)
    $dataDir=Join-Path $clusterRoot ('member-app-'+[guid]::NewGuid().ToString('N'))
    $password=[guid]::NewGuid().ToString('N')
    $pgPort=Free-Port 0; $apiPort=Free-Port 8080; $webPort=Free-Port 18181
    $keyBytes=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
    $qaPassword='Qa!'+[guid]::NewGuid().ToString('N').Substring(0,24)
    $passwordFile=Join-Path $clusterRoot ('member-pw-'+[guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($passwordFile,$password)
        & (Join-Path $PostgresBin 'initdb.exe') -D $dataDir -U dio_member_dev --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$passwordFile
        if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
    } finally { if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile } }
    @(
        "DB_URL=jdbc:postgresql://127.0.0.1:$pgPort/dio_member_app", 'POSTGRES_USER=dio_member_dev', "POSTGRES_PASSWORD=$password",
        "AUTH_JWT_SECRET=$([Convert]::ToBase64String($keyBytes))", "SERVER_PORT=$apiPort", 'SERVER_ADDRESS=127.0.0.1',
        "AUTH_ALLOWED_ORIGINS=http://127.0.0.1:$webPort,http://localhost:$webPort,http://localhost:8081,http://127.0.0.1:8081",
        'DIO_MEMBER_OWNED_DATABASE=true', 'DIO_MEMBER_QA_EMAIL=member-app-qa@example.test', "DIO_MEMBER_QA_PASSWORD=$qaPassword",
        'SPRING_JPA_SHOW_SQL=false'
    ) | Set-Content -LiteralPath $runtimeFile -Encoding utf8
    $metadata=@{ dataDir=$dataDir; postgresBin=$PostgresBin; pgPort=$pgPort; apiPort=$apiPort; webPort=$webPort; database='dio_member_app' }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataFile -Encoding utf8
    $metadata['newDatabase']=$true
} else {
    $metadata=Get-Content -LiteralPath $metadataFile -Raw | ConvertFrom-Json -AsHashtable
    if($metadata.database -ne 'dio_member_app' -or $metadata.dataDir -notmatch 'member-app-[a-f0-9]{32}$') { throw 'Unexpected runtime target' }
    if (!(Test-Path -LiteralPath (Join-Path $metadata.dataDir 'PG_VERSION'))) {
        throw 'Owned PostgreSQL cluster is incomplete (PG_VERSION missing); inspect runtime.json and recover the recorded cluster before restarting'
    }
    $PostgresBin=$metadata.postgresBin
}
Get-Content -LiteralPath $runtimeFile | ForEach-Object {
    if($_ -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1],$Matches[2],'Process') }
}
& (Join-Path $PostgresBin 'pg_ctl.exe') -D $metadata.dataDir status *> $null
if ($LASTEXITCODE -ne 0) {
    # PostgreSQL outlives pg_ctl. Give the launcher file handles so PowerShell does
    # not keep waiting for inherited native-command output pipes after startup.
    $pgStart=Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') `
        -ArgumentList @('-D',('"'+$metadata.dataDir+'"'),'-l',('"'+(Join-Path $metadata.dataDir 'member-server.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$metadata.pgPort+'"'),'-w','start') `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeDir 'postgres-start.log') -RedirectStandardError (Join-Path $runtimeDir 'postgres-start-error.log')
    $pgStart.WaitForExit()
    if($pgStart.ExitCode -ne 0) { throw 'PostgreSQL start failed; inspect ignored runtime logs' }
}
$env:PGPASSWORD=$env:POSTGRES_PASSWORD
# An interrupted first startup may have saved metadata before creating the DB.
# Inspect only this guarded local cluster and keep any existing database intact.
$databaseExists=& (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $metadata.pgPort -U dio_member_dev -d postgres -tAc "select 1 from pg_database where datname='dio_member_app'"
if($LASTEXITCODE -ne 0) { throw 'Owned database existence check failed' }
if(($databaseExists -join '').Trim() -ne '1') {
    & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $metadata.pgPort -U dio_member_dev dio_member_app
    if($LASTEXITCODE -ne 0) { throw 'createdb failed' }
}
$metadata.Remove('newDatabase') | Out-Null
Push-Location (Join-Path $repoRoot 'backend')
try {
    & .\gradlew.bat bootJar --console=plain
    if($LASTEXITCODE -ne 0) { throw 'bootJar failed' }
    $jar=Get-ChildItem build/libs -Filter '*.jar' | Where-Object Name -notlike '*-plain.jar' | Select-Object -First 1
    if($metadata.backendPid) {
        $prior=Get-Process -Id $metadata.backendPid -ErrorAction SilentlyContinue
        if($prior) { throw 'Owned backend is already running; stop its recorded PID before restarting changed code' }
    }
    $backend=Start-Process -FilePath (Join-Path $env:JAVA_HOME 'bin/java.exe') -ArgumentList @('-jar',('"'+$jar.FullName+'"')) -WorkingDirectory (Join-Path $repoRoot 'backend') -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeDir 'backend.log') -RedirectStandardError (Join-Path $runtimeDir 'backend-error.log')
    $metadata.backendPid=$backend.Id
    $metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataFile -Encoding utf8
    $healthy=$false
    for($attempt=0;$attempt -lt 60;$attempt++) {
        try { $response=Invoke-WebRequest "http://127.0.0.1:$($metadata.apiPort)/actuator/health" -TimeoutSec 2; if($response.StatusCode -eq 200) { $healthy=$true; break } } catch {}
        if($backend.HasExited) { throw 'Owned backend exited; inspect ignored runtime log' }
        Start-Sleep -Milliseconds 1000
    }
    if(!$healthy) { throw 'Owned backend health timeout' }
    & .\gradlew.bat seedMemberDevelopment --console=plain
    if($LASTEXITCODE -ne 0) { throw 'QA fixture failed' }
    & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $metadata.pgPort -U dio_member_dev -d dio_member_app -c 'select version,success from flyway_schema_history order by installed_rank; select count(*) as registered_templates from page_templates;'
    $frontendEnv=Join-Path $repoRoot 'frontend/.env.local'
    if(!(Test-Path -LiteralPath $frontendEnv)) { "EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:$($metadata.apiPort)/api/v1" | Set-Content -LiteralPath $frontendEnv -Encoding utf8 }
    Write-Output "MEMBER_API=http://127.0.0.1:$($metadata.apiPort)/api/v1; WEB_QA_PORT=$($metadata.webPort); DB=dio_member_app; MIGRATIONS_APPLIED_BY_FLYWAY=true"
} finally { Pop-Location; Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
