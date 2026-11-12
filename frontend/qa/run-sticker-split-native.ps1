param([string]$KotlinVersion = '2.1.20', [switch]$Large, [string[]]$SheetImages, [switch]$ExpectSplit)
$ErrorActionPreference = 'Stop'
# Uses the compiler already downloaded by Gradle; no device, APK or dependency installation.
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskGradle = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $env:USERPROFILE '.gradle' }
$taskCache = Join-Path $taskGradle 'caches/modules-2/files-2.1'
$taskArtifacts = @(
  "org.jetbrains.kotlin/kotlin-compiler-embeddable/$KotlinVersion",
  "org.jetbrains.kotlin/kotlin-stdlib/$KotlinVersion",
  "org.jetbrains.kotlin/kotlin-script-runtime/$KotlinVersion",
  "org.jetbrains.kotlin/kotlin-reflect/$KotlinVersion",
  "org.jetbrains.kotlin/kotlin-daemon-embeddable/$KotlinVersion",
  'org.jetbrains.intellij.deps/trove4j/1.0.20200330',
  'org.jetbrains/annotations/13.0'
)
$taskJars = $taskArtifacts | ForEach-Object { Get-ChildItem (Join-Path $taskCache $_) -Recurse -Filter '*.jar' | Select-Object -ExpandProperty FullName }
$taskJars += Get-ChildItem (Join-Path $taskCache 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm') -Recurse -Filter '*.jar' | Select-Object -First 1 -ExpandProperty FullName
$taskClassPath = $taskJars -join [IO.Path]::PathSeparator
$taskOutput = Join-Path $taskRoot '.expo/sticker-native-tests'
New-Item -ItemType Directory -Force $taskOutput | Out-Null
& java -cp $taskClassPath org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -classpath $taskClassPath -d $taskOutput (Join-Path $taskRoot 'modules/dio-sticker-split/android/src/main/java/expo/modules/diostickersplit/PixelStore.kt') (Join-Path $taskRoot 'modules/dio-sticker-split/android/src/main/java/expo/modules/diostickersplit/StickerSegmentation.kt') (Join-Path $taskRoot 'tests/native/StickerSegmentationFixture.kt') (Join-Path $taskRoot 'modules/dio-sticker-split/android/src/main/java/expo/modules/diostickersplit/StickerGeometry.kt') (Join-Path $taskRoot 'tests/native/StickerGeometryFixture.kt') (Join-Path $taskRoot 'modules/dio-sticker-split/android/src/main/java/expo/modules/diostickersplit/StickerInput.kt') (Join-Path $taskRoot 'tests/native/StickerInputFixture.kt') (Join-Path $taskRoot 'tests/native/StickerRegionFixture.kt') (Join-Path $taskRoot 'tests/native/StickerSheetImageFixture.kt') (Join-Path $taskRoot 'tests/native/StickerSheetBackgroundFixture.kt') (Join-Path $taskRoot 'tests/native/StickerMinSizeFixture.kt')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Large) {
  & java -Xmx96m -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerSegmentationFixtureKt large
} else {
  & java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerSegmentationFixtureKt
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerGeometryFixtureKt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerInputFixtureKt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerRegionFixtureKt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
 & java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerSheetBackgroundFixtureKt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerMinSizeFixtureKt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($SheetImages) {
  $taskImageArgs = if ($ExpectSplit) { @("--expect-split") + $SheetImages } else { $SheetImages }
  & java -cp "$taskOutput$([IO.Path]::PathSeparator)$taskClassPath" expo.modules.diostickersplit.StickerSheetImageFixtureKt @taskImageArgs
  exit $LASTEXITCODE
}
exit 0
