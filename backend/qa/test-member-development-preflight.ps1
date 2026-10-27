$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'member-development-preflight.ps1')
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$fixture=Join-Path $repoRoot ('.local-data/member-preflight-test-'+[guid]::NewGuid().ToString('N'))
$libs=Join-Path $fixture 'libs'
$jdk=Join-Path $fixture 'jdk'
New-Item -ItemType Directory -Force -Path $libs,(Join-Path $jdk 'bin') | Out-Null
$manifest=Join-Path $fixture 'artifact.txt'
$current=Join-Path $libs 'current.jar'
$stale=Join-Path $libs 'old.jar'
$plain=Join-Path $libs 'current-plain.jar'
$java=Join-Path $jdk 'bin/java.exe'
New-Item -ItemType File -Path $current,$stale,$plain,$java | Out-Null
(Get-Item $stale).LastWriteTime=(Get-Date).AddDays(1)
$endpoint=Join-Path $fixture '.env.local'
$script:passed=0
function Check([string]$Name,[scriptblock]$Body) {
    & $Body
    $script:passed++
    Write-Output "PASS: $Name"
}
function Expect-Failure([string]$Message,[scriptblock]$Body) {
    try { & $Body; throw 'Expected failure was absent' }
    catch { if (!$_.Exception.Message.Contains($Message)) { throw } }
}
function Check-Endpoint([string]$Text,[int]$Warnings) {
    [IO.File]::WriteAllText($endpoint,$Text)
    $before=(Get-FileHash -LiteralPath $endpoint).Hash
    $seen=@()
    Confirm-MemberDevelopmentEndpoint $endpoint 8080 -WarningVariable seen -WarningAction SilentlyContinue
    if (@($seen).Count -ne $Warnings) { throw 'Unexpected endpoint warning count' }
    if ((Get-FileHash -LiteralPath $endpoint).Hash -ne $before) { throw 'Existing personal setting was overwritten' }
    if (($seen | Out-String).Contains('private-placeholder')) { throw 'Warning exposed existing endpoint' }
}
try {
    Check 'missing Java home is explicit' { Expect-Failure 'JAVA_HOME is required' { Get-MemberDevelopmentJava '' } }
    Check 'invalid Java home is explicit' { Expect-Failure 'bin/java.exe' { Get-MemberDevelopmentJava (Join-Path $fixture 'missing') } }
    Check 'valid Java executable resolved' { if ((Get-MemberDevelopmentJava $jdk) -ne $java) { throw 'Wrong Java executable' } }
    $pgBin=Join-Path $fixture 'pgsql/bin'
    $timezoneDir=Join-Path $fixture 'pgsql/share/timezonesets'
    New-Item -ItemType Directory -Force -Path $pgBin,$timezoneDir | Out-Null
    foreach($file in @('postgres.exe','psql.exe','pg_ctl.exe','initdb.exe','createdb.exe')) { New-Item -ItemType File -Path (Join-Path $pgBin $file) | Out-Null }
    $default=Join-Path $timezoneDir 'Default'
    New-Item -ItemType File -Path $default | Out-Null
    Check 'complete PostgreSQL support paths accepted' { Assert-MemberPostgresInstallation $pgBin }
    Check 'missing timezone support fails without data reinitialization' {
        Remove-Item -LiteralPath $default
        Expect-Failure 'Incomplete PostgreSQL installation' { Assert-MemberPostgresInstallation $pgBin }
        New-Item -ItemType File -Path $default | Out-Null
    }
    Check 'missing psql fails clearly' {
        $psql=Join-Path $pgBin 'psql.exe'; Remove-Item -LiteralPath $psql
        Expect-Failure 'Incomplete PostgreSQL installation' { Assert-MemberPostgresInstallation $pgBin }
        New-Item -ItemType File -Path $psql | Out-Null
    }
    Check 'missing createdb fails before initialization' {
        $createdb=Join-Path $pgBin 'createdb.exe'; Remove-Item -LiteralPath $createdb
        Expect-Failure 'Incomplete PostgreSQL installation' { Assert-MemberPostgresInstallation $pgBin }
        New-Item -ItemType File -Path $createdb | Out-Null
    }
    Check 'missing artifact manifest is explicit' { Expect-Failure 'manifest is missing' { Get-MemberDevelopmentArtifact $manifest $libs } }
    Check 'exact Gradle output wins over newer stale jars' {
        $current | Set-Content -LiteralPath $manifest
        if ((Get-MemberDevelopmentArtifact $manifest $libs).FullName -ne $current) { throw 'Stale jar was selected' }
    }
    Check 'relative artifact is rejected' { 'current.jar' | Set-Content $manifest; Expect-Failure 'Invalid bootJar' { Get-MemberDevelopmentArtifact $manifest $libs } }
    Check 'outside artifact is rejected' { (Join-Path $fixture 'outside.jar') | Set-Content $manifest; Expect-Failure 'Unexpected bootJar' { Get-MemberDevelopmentArtifact $manifest $libs } }
    Check 'plain artifact is rejected' { $plain | Set-Content $manifest; Expect-Failure 'Unexpected bootJar' { Get-MemberDevelopmentArtifact $manifest $libs } }
    Check 'missing recorded jar is rejected' { (Join-Path $libs 'missing.jar') | Set-Content $manifest; Expect-Failure 'does not exist' { Get-MemberDevelopmentArtifact $manifest $libs } }
    Check 'ambiguous manifest is rejected' { @($current,$stale) | Set-Content $manifest; Expect-Failure 'Invalid bootJar' { Get-MemberDevelopmentArtifact $manifest $libs } }
    Check 'matching loopback endpoint is preserved' { Check-Endpoint 'EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8080/api/v1' 0 }
    Check 'matching localhost endpoint is preserved' { Check-Endpoint 'EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1/' 0 }
    Check 'quoted endpoint is preserved' { Check-Endpoint 'EXPO_PUBLIC_API_BASE_URL="http://localhost:8080/api/v1"' 0 }
    Check 'mismatched endpoint warns without exposure or overwrite' { Check-Endpoint 'EXPO_PUBLIC_API_BASE_URL=https://private-placeholder:private-placeholder@example.test/api' 1 }
    Check 'old API port warns without overwrite' { Check-Endpoint 'EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:9090/api/v1' 1 }
    Check 'missing endpoint key warns without overwrite' { Check-Endpoint 'PRIVATE_SETTING=private-placeholder' 1 }
    Check 'duplicate endpoint keys warn without overwrite' { Check-Endpoint "EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1`nEXPO_PUBLIC_API_BASE_URL=http://localhost:9090/api/v1" 1 }
    Check 'missing frontend file is initialized' {
        Remove-Item -LiteralPath $endpoint
        Confirm-MemberDevelopmentEndpoint $endpoint 8080
        if ((Get-Content $endpoint -Raw).Trim() -ne 'EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8080/api/v1') { throw 'Wrong new endpoint' }
    }
    Write-Output "Preflight checks passed: $script:passed"
} finally {
    $resolved=[IO.Path]::GetFullPath($fixture)
    $allowed=[IO.Path]::GetFullPath((Join-Path $repoRoot '.local-data'))+[IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
