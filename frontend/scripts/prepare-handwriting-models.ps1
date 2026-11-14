param([Parameter(Mandatory=$true)][string]$SourceDirectory)
$ErrorActionPreference = 'Stop'
$taskSource = (Resolve-Path -LiteralPath $SourceDirectory).Path
$taskDestination = Join-Path $PSScriptRoot '../modules/dio-handwriting/android/src/main/assets/dio_handwriting'
$taskModelVersion = 'dmfont-fp32-e5b28ca6-inference-v2'
$taskFiles = @{
  'encoder.fp32.onnx' = '36f39745654a47a352752251429c36fc8f607256a3446d18791bb32b9bfdbab0'
  'decoder.fp32.onnx' = '73ceea513ee8eba489f44a1f9658f2cd22d77fb6881cbd70a79fd307c80f1368'
}
$taskManifest = Get-Content -LiteralPath (Join-Path $taskSource 'manifest.json') -Raw | ConvertFrom-Json
if ($taskManifest.model_version -ne $taskModelVersion -or $taskManifest.verification.glyphs -ne 11172 -or $taskManifest.status -ne 'verified; 11172 glyph equivalence and TTF checks passed') { throw 'Use the verified inference-v2 bundle after full equivalence and TTF checks.' }
if ($taskManifest.verification.pixel_max -gt 1 -or $taskManifest.verification.pixel_mean_max -ge 0.001 -or -not $taskManifest.verification.torch_exact.features -or -not $taskManifest.verification.torch_exact.skips -or -not $taskManifest.verification.torch_exact.outputs) { throw 'The bundle did not meet equivalence requirements.' }
foreach ($taskName in $taskFiles.Keys) {
  $taskFile = Join-Path $taskSource $taskName
  if ((Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskFiles[$taskName]) { throw "Model checksum mismatch: $taskName" }
  if ($taskManifest.files.$taskName.sha256 -ne $taskFiles[$taskName]) { throw "Manifest mismatch: $taskName" }
}
foreach ($taskName in @('LICENSE','NOTICE')) { if (-not (Test-Path -LiteralPath (Join-Path $taskSource $taskName))) { throw "Missing attribution: $taskName" } }
$taskNotice = Join-Path $PSScriptRoot '../../ai/handwriting/NOTICE'
if (-not (Test-Path -LiteralPath $taskNotice)) { throw 'Missing current inference source NOTICE.' }
New-Item -ItemType Directory -Path $taskDestination -Force | Out-Null
foreach ($taskName in @($taskFiles.Keys) + @('manifest.json','LICENSE')) { Copy-Item -LiteralPath (Join-Path $taskSource $taskName) -Destination (Join-Path $taskDestination $taskName) }
# Model weights stay pinned, but preprocessing follows this checkout.
$taskInstalledManifestPath = Join-Path $taskDestination 'manifest.json'
$taskInstalledManifest = Get-Content -LiteralPath $taskInstalledManifestPath -Raw | ConvertFrom-Json
$taskInstalledManifest.preprocess_version = 'dio-ink-safe90-margin4-fp32-v2'
$taskInstalledManifest | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $taskInstalledManifestPath -Encoding utf8
# Models are pinned above; use their current source attribution even for older verified bundles.
Copy-Item -LiteralPath $taskNotice -Destination (Join-Path $taskDestination 'NOTICE')
Write-Output 'Verified FP32 models prepared. No handwriting data or private feature cache copied.'
