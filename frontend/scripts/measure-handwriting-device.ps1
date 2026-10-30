param(
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9._:-]+$')][string]$Serial,
  [ValidatePattern('^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$')][string]$PackageName = 'com.f106.DIO.handwritingdev',
  [ValidatePattern('^$|^[a-f0-9-]{36}$')][string]$JobId = '',
  [string]$JobIdFile = '',
  [switch]$WaitForProcessing,
  [ValidateRange(2,60)][int]$IntervalSeconds = 5,
  [ValidateRange(10,14400)][int]$DurationSeconds = 7200,
  [string]$OutputDirectory,
  [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference = 'Stop'
$taskPackage = $PackageName
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot "../qa/handwriting-output/device/$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))" }
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath (Join-Path $taskOutput 'samples.jsonl')) { throw 'Use a new measurement output directory.' }
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
function Read-Device([string[]]$Arguments) {
  $taskResult = & $Adb -s $Serial @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($taskResult -join "`n") }
  return ($taskResult -join "`n").Trim()
}
function Read-Optional([string[]]$Arguments) {
  try { return Read-Device -Arguments $Arguments } catch { return "UNAVAILABLE: $($_.Exception.Message)" }
}
function Find-Number([string]$Text, [string]$Pattern) {
  $taskMatch = [regex]::Match($Text, $Pattern, 'Multiline')
  if ($taskMatch.Success) { return [double]::Parse($taskMatch.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) }
  return $null
}
if ((Read-Device -Arguments @('get-state')) -ne 'device') { throw 'ADB device is not authorized/connected.' }
$taskMetadata = [ordered]@{
  schema = 1; startedUtc = [DateTime]::UtcNow.ToString('o'); physicalDeviceClaim = 'Verify ro.kernel.qemu before interpreting results'
  model = Read-Device -Arguments @('shell','getprop','ro.product.model')
  manufacturer = Read-Device -Arguments @('shell','getprop','ro.product.manufacturer')
  androidRelease = Read-Device -Arguments @('shell','getprop','ro.build.version.release')
  api = Read-Device -Arguments @('shell','getprop','ro.build.version.sdk')
  soc = Read-Optional -Arguments @('shell','getprop','ro.soc.model')
  emulator = Read-Optional -Arguments @('shell','getprop','ro.kernel.qemu')
  package = $taskPackage; jobId = $JobId; jobIdFile = $JobIdFile; intervalSeconds = $IntervalSeconds
  timing = 'Job input/state file mtimes use device epoch seconds; sampling boundaries have up to one interval of uncertainty.'
  memory = 'Observed TOTAL PSS includes swap PSS on this Android build. Resident PSS is TOTAL PSS minus SWAP PSS when reported. RSS retains shared pages in full. Not exact allocation high-water marks.'
  temperature = 'Battery temperature is a battery sensor, not CPU junction or surface temperature. Raw thermalservice sensors are retained separately.'
  battery = 'USB charging can change temperature and charge level; no claim of energy consumed is derived from battery percentage.'
  screenBrightness = Read-Optional -Arguments @('shell','settings','get','system','screen_brightness')
  screenBrightnessMode = Read-Optional -Arguments @('shell','settings','get','system','screen_brightness_mode')
  screenOffTimeout = Read-Optional -Arguments @('shell','settings','get','system','screen_off_timeout')
  stayOnSetting = Read-Optional -Arguments @('shell','settings','get','global','stay_on_while_plugged_in')
}
$taskMetadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskOutput 'metadata.json') -Encoding utf8
$taskClock = [Diagnostics.Stopwatch]::StartNew()
$taskCount = 0
$taskSeenProcessing = -not $WaitForProcessing
while ($taskClock.Elapsed.TotalSeconds -lt $DurationSeconds) {
  if (-not $JobId -and $JobIdFile -and (Test-Path -LiteralPath $JobIdFile)) {
    $taskCandidate = (Get-Content -LiteralPath $JobIdFile -Raw).Trim()
    if ($taskCandidate -notmatch '^[a-f0-9-]{36}$') { throw 'Invalid benchmark job id.' }
    $JobId = $taskCandidate; $taskMetadata.jobId = $JobId
    $taskMetadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskOutput 'metadata.json') -Encoding utf8
  }
  $taskStarted = $taskClock.Elapsed.TotalSeconds
  $taskBattery = Read-Optional -Arguments @('shell','dumpsys','battery')
  # Samsung appends historical battery/device identifiers to this dump. Keep
  # only the current measurements needed for this benchmark.
  $taskBattery = (($taskBattery -split "`n") | Where-Object { $_ -match '^\s*(Current Battery Service state:|AC powered:|USB powered:|Wireless powered:|status:|health:|present:|level:|scale:|voltage:|temperature:|Charge counter:|current now:|Charging state:)' }) -join "`n"
  $taskThermal = Read-Optional -Arguments @('shell','dumpsys','thermalservice')
  $taskMemory = Read-Optional -Arguments @('shell','dumpsys','meminfo','-s',$taskPackage)
  $taskBatteryRaw = Find-Number $taskBattery '^\s*temperature:\s*(-?[\d.]+)'
  $taskPss = Find-Number $taskMemory 'TOTAL PSS:\s*([\d.]+)'
  if ($null -eq $taskPss) { $taskPss = Find-Number $taskMemory '^\s*TOTAL\s+([\d.]+)' }
  $taskSwapPss = Find-Number $taskMemory 'TOTAL SWAP PSS:\s*([\d.]+)'
  $taskRss = Find-Number $taskMemory 'TOTAL RSS:\s*([\d.]+)'
  $taskJob = $null; $taskInputEpoch = $null; $taskStateEpoch = $null
  $taskSensors = @()
  $taskSection = [regex]::Match($taskThermal, '(?s)Current temperatures from HAL:\s*(.*?)Current cooling devices')
  if ($taskSection.Success) {
    foreach ($taskSensor in [regex]::Matches($taskSection.Groups[1].Value, 'Temperature\{mValue=([-\d.]+), mType=(\d+), mName=([^,}]+), mStatus=(\d+)\}')) {
      $taskSensors += [ordered]@{ name=$taskSensor.Groups[3].Value; valueC=[double]::Parse($taskSensor.Groups[1].Value,[Globalization.CultureInfo]::InvariantCulture); type=[int]$taskSensor.Groups[2].Value; status=[int]$taskSensor.Groups[4].Value }
    }
  }
  if ($JobId) {
    $taskJobText = Read-Optional -Arguments @('shell','run-as',$taskPackage,'cat',"files/dio-handwriting/jobs/$JobId/state.json")
    try { $taskJob = $taskJobText | ConvertFrom-Json } catch { }
    $taskInputEpoch = Read-Optional -Arguments @('shell','run-as',$taskPackage,'stat','-c','%Y',"files/dio-handwriting/jobs/$JobId/input.json")
    $taskStateEpoch = Read-Optional -Arguments @('shell','run-as',$taskPackage,'stat','-c','%Y',"files/dio-handwriting/jobs/$JobId/state.json")
  }
  $taskSample = [ordered]@{
    utc = [DateTime]::UtcNow.ToString('o'); elapsedSeconds = [Math]::Round($taskStarted,3)
    collectionSeconds = [Math]::Round($taskClock.Elapsed.TotalSeconds - $taskStarted,3)
    batteryTemperatureC = if ($null -ne $taskBatteryRaw) { $taskBatteryRaw / 10 } else { $null }
    batteryLevel = Find-Number $taskBattery '^\s*level:\s*(\d+)'
    usbPowered = [regex]::Match($taskBattery,'USB powered:\s*(\w+)').Groups[1].Value
    batteryStatus = Find-Number $taskBattery '^\s*status:\s*(\d+)'
    thermalStatus = Find-Number $taskThermal 'Thermal Status:\s*(\d+)'
    thermalSensorsCurrentHal = $taskSensors
    totalPssKb = $taskPss; swapPssKb = $taskSwapPss; totalRssKb = $taskRss
    residentPssKb = if ($null -ne $taskPss -and $null -ne $taskSwapPss) { $taskPss - $taskSwapPss } else { $null }
    job = $taskJob; jobInputEpochSeconds = $taskInputEpoch; stateEpochSeconds = $taskStateEpoch
    batteryRaw = $taskBattery; thermalRaw = $taskThermal; memoryRaw = $taskMemory
  }
  $taskSample | ConvertTo-Json -Compress -Depth 8 | Add-Content -LiteralPath (Join-Path $taskOutput 'samples.jsonl') -Encoding utf8
  $taskCount++
  if ($taskJob -and $taskJob.state -eq 'processing') { $taskSeenProcessing = $true }
  Write-Output ("sample={0} elapsed={1:n1}s battery={2}C thermal={3} PSS={4}KB state={5} completed={6}" -f $taskCount,$taskStarted,$taskSample.batteryTemperatureC,$taskSample.thermalStatus,$taskPss,$taskJob.state,$taskJob.completed)
  if ($taskJob -and ($taskJob.state -in @('ready','failed','cancelled') -or ($taskJob.state -eq 'paused' -and $taskSeenProcessing))) { break }
  $taskRemaining = $IntervalSeconds - ($taskClock.Elapsed.TotalSeconds - $taskStarted)
  if ($taskRemaining -gt 0) { Start-Sleep -Milliseconds ([int]($taskRemaining * 1000)) }
}
Write-Output "Local measurement files: $taskOutput"
