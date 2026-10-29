# DIO DM-Font inference source

This package retains attributed MIT DM-Font generator components and supplies
an independently written tensor-axis split with `torch.unflatten`. It excludes
upstream `models/modules/modules.py`, the training initializer, spectral-weight
normalization, discriminator and auxiliary classifier. Internal imports are
explicit and namespaced under `dio_dmfont`; production export needs no upstream
Python tree. Only Korean inference and unchanged weight normalization are supported.

[PROVENANCE.json](./dio_dmfont/PROVENANCE.json) records the seven MIT source files, their upstream hashes,
local modifications, and DIO-written files. [UPSTREAM_LICENSE](./dio_dmfont/UPSTREAM_LICENSE) retains NAVER's
MIT terms. [license-history/DMFont-NOTICE-v1.txt](./license-history/DMFont-NOTICE-v1.txt) preserves the prior notice for
history and is not an active dependency of the new package. Weight and training
dataset rights are outside this code review's scope.

From `frontend/`, using Python with the versions in `requirements.txt`:

```powershell
python -B -m unittest discover -s model-tools -p test_inference.py -v
python -B scripts/export-handwriting-model.py --checkpoint '<original checkpoint>' --output 'qa/handwriting-output/new-inference/models'
python -B scripts/verify-handwriting-inference.py --checkpoint '<original checkpoint>' --snapshot '<fixed 36-input snapshot>' --models 'qa/handwriting-output/new-inference/models' --baseline-models '<verified v1 FP32 ONNX folder>' --baseline-rasters '<verified v1 full raw output folder>' --output 'qa/handwriting-output/new-inference/full' --original-root '<read-only upstream demo root>'
pwsh scripts/prepare-handwriting-models.ps1 -SourceDirectory 'qa/handwriting-output/new-inference/models'
```

The exporter refuses to overwrite existing ONNX files. The comparison launches
the upstream model only in an isolated baseline process. It verifies all checkpoint
tensors, exact PyTorch features/probes, ONNX features, every Hangul raster, and a
real TTF. The preparation script accepts only the pinned, fully verified bundle.
Private samples, rasters, fonts, ONNX files and reports stay in ignored local QA
folders; they are not part of this source package.

Model preparation copies the current [NOTICE](./NOTICE) from this source tree,
including when using an older verified model bundle. Its inventory/history
references identify source-repository paths, not files in Android model assets.

Android uses ONNX Runtime 1.23.2. The desktop comparison uses 1.31.0. Both execute
FP32 CPU batch 1. No new learning, quantization or 64px/8px feature paths are used.

For a paired Android comparison, put the verified v1 graphs in the ignored
`modules/dio-handwriting/android/src/androidTest/assets/baseline/` directory of
the short build mirror before assembling `:dio-handwriting:assembleDebugAndroidTest`.
The test pins both v1 hashes and compares 12 glyphs byte for byte using the same
Android runtime settings. `snapshot.json`, `expected/*.gray` and `full-font.ttf`
in that test assets directory are optional private fixtures. None of these files
belong in production assets. Without v1 graphs the smoke test checks execution
and reports zero paired comparisons; it must not be reported as v1/v2 parity.
Cross-platform desktop/Android rounding is reported separately.

Build the multi-ABI development APK from `frontend/`:

```powershell
pwsh scripts/build-handwriting-android.ps1 -BuildDirectory '<short dedicated build folder>' -Architecture 'arm64-v8a,x86_64' -ArtifactPrefix 'dio-font-inference-v2'
```
