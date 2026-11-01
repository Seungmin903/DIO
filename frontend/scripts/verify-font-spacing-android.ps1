param(
  [Parameter(Mandatory)][string]$Original,
  [Parameter(Mandatory)][string]$Corrected,
  [Parameter(Mandatory)][string]$Generated,
  [Parameter(Mandatory)][string]$Output,
  [ValidatePattern('^emulator-[0-9]+$')][string]$Serial = 'emulator-5554'
)
$ErrorActionPreference = 'Stop'
$sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$tools = Join-Path $sdk 'build-tools/36.0.0'
$android = Join-Path $sdk 'platforms/android-36/android.jar'
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$target = [IO.Path]::GetFullPath($Output)
if ((Test-Path -LiteralPath $target) -and (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1)) { throw 'Use an empty audit directory.' }
$originalPath = (Resolve-Path -LiteralPath $Original).Path
$correctedPath = (Resolve-Path -LiteralPath $Corrected).Path
$generatedPath = (Resolve-Path -LiteralPath $Generated).Path
New-Item -ItemType Directory -Force -Path $target,"$target/assets","$target/classes","$target/dex" | Out-Null
Copy-Item -LiteralPath $originalPath -Destination "$target/assets/original.ttf"
Copy-Item -LiteralPath $correctedPath -Destination "$target/assets/js.ttf"
Copy-Item -LiteralPath $generatedPath -Destination "$target/assets/native.ttf"
@'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.f106.fontspacingaudit"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:debuggable="true" android:label="Local font spacing audit"><activity android:name=".FontSpacingAuditActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>
'@ | Set-Content -LiteralPath "$target/AndroidManifest.xml" -Encoding utf8
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed: $LASTEXITCODE" } }
& javac --release 8 -classpath $android -d "$target/classes" "$PSScriptRoot/FontSpacingAuditActivity.java"; Check-Exit
& jar cf "$target/audit.jar" -C "$target/classes" .; Check-Exit
& "$tools/d8.bat" --lib $android --output "$target/dex" "$target/audit.jar"; Check-Exit
& "$tools/aapt.exe" package -f -M "$target/AndroidManifest.xml" -I $android -A "$target/assets" -F "$target/unsigned.apk"; Check-Exit
Push-Location "$target/dex"
try { & "$tools/aapt.exe" add "$target/unsigned.apk" classes.dex; Check-Exit } finally { Pop-Location }
& "$tools/zipalign.exe" -f 4 "$target/unsigned.apk" "$target/aligned.apk"; Check-Exit
$key = Join-Path $target 'audit.keystore'
& keytool -genkeypair -keystore $key -alias audit -storepass android -keypass android -dname 'CN=Local Font Audit' -keyalg RSA -validity 30 -noprompt; Check-Exit
& "$tools/apksigner.bat" sign --ks $key --ks-key-alias audit --ks-pass pass:android --key-pass pass:android --out "$target/audit.apk" "$target/aligned.apk"; Check-Exit
# This package is reserved for this emulator-only audit. Each isolated build
# uses its own throwaway signing key; DIO and its data are never uninstalled.
& $adb -s $Serial uninstall com.f106.fontspacingaudit 2>$null | Out-Null
& $adb -s $Serial install "$target/audit.apk"; Check-Exit
& $adb -s $Serial shell am start -n 'com.f106.fontspacingaudit/.FontSpacingAuditActivity'; Check-Exit
Write-Output 'Audit launched. Read only its report with adb exec-out run-as com.f106.fontspacingaudit cat files/report.json.'
