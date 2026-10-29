param(
  [string]$BuildDirectory = "$env:USERPROFILE/.dfont",
  [ValidateSet('arm64-v8a','x86_64','arm64-v8a,x86_64')][string]$Architecture = 'arm64-v8a',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]{0,63}$')][string]$ArtifactPrefix = 'dio-font-dev',
  [switch]$Test,
  [switch]$Release
)
$ErrorActionPreference = 'Stop'
if ($Test -and $Release) { throw 'Choose either instrumentation tests or a release audit build.' }
$taskSource = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskTarget = [IO.Path]::GetFullPath($BuildDirectory).TrimEnd('\','/')
if ($taskTarget -eq [IO.Path]::GetPathRoot($taskTarget) -or $taskTarget -eq $taskSource -or $taskTarget.StartsWith($taskSource + '\')) { throw 'Use a separate short build directory.' }
$taskMarker = Join-Path $taskTarget '.dio-font-build-source'
if ((Test-Path -LiteralPath $taskTarget) -and (Get-ChildItem -LiteralPath $taskTarget -Force | Select-Object -First 1)) {
  if (-not (Test-Path -LiteralPath $taskMarker) -or (Get-Content -LiteralPath $taskMarker -Raw).Trim() -ne $taskSource) { throw 'Build directory is not owned by this clone. Choose an empty directory.' }
}
New-Item -ItemType Directory -Path $taskTarget -Force | Out-Null
Set-Content -LiteralPath $taskMarker -Value $taskSource
$taskExcluded = @('node_modules','android','.expo','dist','dist-android','qa','third-party/cache','modules/dio-handwriting/android/build','modules/dio-handwriting/android/.gradle') | ForEach-Object { Join-Path $taskSource $_ }
& robocopy $taskSource $taskTarget /E /XD @taskExcluded /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) { throw 'Build source copy failed.' }
Push-Location -LiteralPath $taskTarget
$taskPreviousLinker = $env:PNPM_CONFIG_NODE_LINKER
try {
  # A flat native build layout avoids Windows CMake/Prefab path limits from
  # pnpm's hashed virtual-store paths. The working clone keeps its normal layout.
  # Keep exec's automatic dependency synchronization on the same linker too.
  $env:PNPM_CONFIG_NODE_LINKER = 'hoisted'
  $taskModuleMetadata = Join-Path $taskTarget 'node_modules/.modules.yaml'
  if ((Test-Path -LiteralPath $taskModuleMetadata) -and (Get-Content -LiteralPath $taskModuleMetadata -Raw) -match 'nodeLinker["'':\s]+isolated') {
    throw 'This build copy has an isolated dependency layout. Choose a new empty -BuildDirectory for the flat Android build.'
  }
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  & pnpm exec expo prebuild --platform android --no-install --clean
  if ($LASTEXITCODE -ne 0) { throw 'Android prebuild failed.' }
  Push-Location android
  try {
    $taskGradle = if ($Test) { @(':dio-handwriting:connectedDebugAndroidTest') } elseif ($Release) { @(':app:assembleRelease', ':app:bundleRelease') } else { @(':app:assembleDebug') }
    & .\gradlew.bat @taskGradle "-PreactNativeArchitectures=$Architecture" --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build/test failed.' }
  } finally { Pop-Location }
  if (-not $Test) {
    $taskOutput = Join-Path $taskSource 'qa/handwriting-output/android'
    New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
    $taskArtifact = Join-Path $taskOutput "$ArtifactPrefix-$($Architecture.Replace(',','-')).apk"
    $taskApk = if ($Release) { 'android/app/build/outputs/apk/release/app-release.apk' } else { 'android/app/build/outputs/apk/debug/app-debug.apk' }
    Copy-Item -LiteralPath $taskApk -Destination $taskArtifact
    if ($Release) {
      Copy-Item -LiteralPath 'android/app/build/outputs/bundle/release/app-release.aab' -Destination ($taskArtifact -replace '\.apk$', '.aab')
      Write-Output "Release audit APK/AAB saved in $taskOutput. The template debug signing key is for local inspection, not store publication."
    } else { Write-Output "Development APK saved in $taskArtifact. This is not a phone performance result." }
  }
} finally { $env:PNPM_CONFIG_NODE_LINKER = $taskPreviousLinker; Pop-Location }
