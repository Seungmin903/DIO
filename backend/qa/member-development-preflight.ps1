function Get-MemberDevelopmentJava([string]$JavaHome) {
    if ([string]::IsNullOrWhiteSpace($JavaHome)) { throw 'JAVA_HOME is required; set it to a JDK directory before starting member development' }
    $executable=Join-Path $JavaHome 'bin/java.exe'
    if (!(Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'JAVA_HOME must contain bin/java.exe; no database or backend was started' }
    return [IO.Path]::GetFullPath($executable)
}

function Assert-MemberPostgresInstallation([string]$PostgresBin) {
    $required=@('postgres.exe','psql.exe','pg_ctl.exe','initdb.exe') | ForEach-Object { Join-Path $PostgresBin $_ }
    $required+=Join-Path (Split-Path $PostgresBin) 'share/timezonesets/Default'
    foreach($file in $required) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
            throw 'Incomplete PostgreSQL installation: restore matching bin/lib/share support files without initdb or changing the data directory'
        }
    }
}

function Get-MemberDevelopmentArtifact([string]$Manifest,[string]$LibraryDirectory) {
    if (!(Test-Path -LiteralPath $Manifest -PathType Leaf)) { throw 'bootJar artifact manifest is missing' }
    $lines=@(Get-Content -LiteralPath $Manifest | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
    if ($lines.Count -ne 1 -or ![IO.Path]::IsPathFullyQualified($lines[0])) { throw 'Invalid bootJar artifact manifest' }
    $path=[IO.Path]::GetFullPath($lines[0])
    if (![string]::Equals([IO.Path]::GetDirectoryName($path),[IO.Path]::GetFullPath($LibraryDirectory),[StringComparison]::OrdinalIgnoreCase) `
        -or [IO.Path]::GetExtension($path) -ne '.jar' -or $path -like '*-plain.jar') { throw 'Unexpected bootJar artifact target' }
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Recorded bootJar artifact does not exist' }
    return Get-Item -LiteralPath $path
}

function Confirm-MemberDevelopmentEndpoint {
    [CmdletBinding()]
    param([string]$File,[int]$ApiPort)
    $expected="http://127.0.0.1:$ApiPort/api/v1"
    if (!(Test-Path -LiteralPath $File)) {
        "EXPO_PUBLIC_API_BASE_URL=$expected" | Set-Content -LiteralPath $File -Encoding utf8
        return
    }
    $entries=@(Get-Content -LiteralPath $File | Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_BASE_URL\s*=' })
    $matchesEndpoint=$false
    if ($entries.Count -eq 1) {
        $value=($entries[0] -split '=',2)[1].Trim().Trim('"',"'")
        $uri=$null
        if ([Uri]::TryCreate($value,[UriKind]::Absolute,[ref]$uri)) {
            $matchesEndpoint=$uri.Scheme -eq 'http' -and $uri.Host -in @('127.0.0.1','localhost') `
                -and $uri.Port -eq $ApiPort -and $uri.AbsolutePath.TrimEnd('/') -eq '/api/v1' `
                -and !$uri.Query -and !$uri.Fragment -and !$uri.UserInfo
        }
    }
    if (!$matchesEndpoint) {
        # Do not print or overwrite a personal endpoint: it may contain secrets.
        Write-Warning "Existing frontend/.env.local does not identify the member loopback API on port $ApiPort. Review EXPO_PUBLIC_API_BASE_URL; the file was preserved."
    }
}
