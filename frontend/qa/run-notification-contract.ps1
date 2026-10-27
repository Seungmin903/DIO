param([string]$BackendRoot)
$ErrorActionPreference = 'Stop'
$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $BackendRoot) { $BackendRoot = Join-Path $frontendRoot '../backend' }
$backendPath = (Resolve-Path $BackendRoot).Path
if (-not (Test-Path (Join-Path $backendPath 'src/test/java/com/f106/DIO/notification/NotificationFrontendContractTests.java'))) {
    throw '계약 생산자 테스트가 있는 backend 경로를 -BackendRoot로 지정해 주세요.'
}
$outputRoot = Join-Path $frontendRoot '.expo/notification-contract'
New-Item -ItemType Directory -Force $outputRoot | Out-Null
$initFile = Join-Path $outputRoot 'contract-init.gradle'
Set-Content -LiteralPath $initFile -Encoding utf8 -Value "allprojects { layout.buildDirectory.set(layout.projectDirectory.dir('.gradle/notification-frontend-contract-build')) }"
$previousOutput = $env:DIO_NOTIFICATION_CONTRACT_OUTPUT
$env:DIO_NOTIFICATION_CONTRACT_OUTPUT = Join-Path $outputRoot ([guid]::NewGuid().ToString('N') + '.json')
try {
    Push-Location $backendPath
    try {
        & ./gradlew.bat test --tests 'com.f106.DIO.notification.NotificationFrontendContractTests.exportsActualSpringResponsesForFrontend' --offline --console=plain --rerun-tasks --init-script $initFile --project-cache-dir .gradle/notification-frontend-contract-cache
        if ($LASTEXITCODE -ne 0) { throw 'Spring 계약 생산자 검증 실패' }
    } finally { Pop-Location }
    if (-not (Test-Path -LiteralPath $env:DIO_NOTIFICATION_CONTRACT_OUTPUT)) { throw '현재 실행의 Spring 응답 파일이 생성되지 않았습니다.' }
    Push-Location $frontendRoot
    try {
        & node --test tests/spring-notification-contract.test.js
        if ($LASTEXITCODE -ne 0) { throw '프런트 Spring 계약 소비자 검증 실패' }
    } finally { Pop-Location }
} finally { $env:DIO_NOTIFICATION_CONTRACT_OUTPUT = $previousOutput }
