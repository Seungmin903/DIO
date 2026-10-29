"""Read a completed debug-app job locally and validate actual phone outputs."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from scipy import ndimage as ndi


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', required=True)
    parser.add_argument('--run', required=True)
    parser.add_argument('--desktop-rasters', required=True)
    parser.add_argument('--adb', default=os.path.join(os.environ['LOCALAPPDATA'], 'Android/Sdk/platform-tools/adb.exe'))
    args = parser.parse_args()
    folder, desktop = Path(args.run), Path(args.desktop_rasters)
    job_id = (folder / 'full-job-id.txt').read_text(encoding='utf-8-sig').strip()
    if not re.fullmatch(r'[a-f0-9-]{36}', job_id):
        raise ValueError('Invalid local job id')
    prefix = [args.adb, '-s', args.serial, 'exec-out', 'run-as', 'com.f106.DIO.handwritingdev']

    def device(*command):
        return subprocess.check_output(prefix + list(command))

    relative = f'files/dio-handwriting/jobs/{job_id}'
    state = json.loads(device('cat', f'{relative}/state.json'))
    assert state['state'] == 'ready' and state['completed'] == 11172, state
    reference = json.loads((desktop / 'validation.json').read_text(encoding='utf-8'))
    assert state['inputHash'] == reference['input_hash']
    (folder / 'final-native-state.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    raw = device('cat', f'{relative}/font.ttf')
    assert 100 < len(raw) <= 64 * 1024 * 1024 and len(raw) % 4 == 0
    assert int(np.frombuffer(raw, dtype='>u4').sum(dtype=np.uint64)) & 0xffffffff == 0xb1b0afba
    path = folder / 'device-generated.ttf'
    path.write_bytes(raw)
    font = TTFont(path, checkChecksums=2)
    mapping = font.getBestCmap()
    codes = list(range(0xac00, 0xd7a4))
    assert all(code in mapping for code in codes)
    assert all(font['glyf'][mapping[c]].numberOfContours > 0 for c in codes)
    maximum_points = max(font['glyf'][mapping[c]].endPtsOfContours[-1] + 1 for c in codes)
    maximum_contours = max(font['glyf'][mapping[c]].numberOfContours for c in codes)
    assert font['maxp'].maxPoints == maximum_points and font['maxp'].maxContours == maximum_contours
    renderer = ImageFont.truetype(str(path), 128)
    comparisons = []
    for code in codes[::max(1, len(codes) // 60)]:
        pc = np.frombuffer((desktop / f'{code}.gray').read_bytes(), dtype=np.uint8).reshape(128, 128) < 200
        image = Image.new('L', (128, 128), 255)
        ImageDraw.Draw(image).text((0, 107.5), chr(code), font=renderer, fill=0, anchor='ls')
        phone = np.asarray(image) < 200
        precision = (ndi.distance_transform_edt(~pc)[phone] <= 2).mean()
        recall = (ndi.distance_transform_edt(~phone)[pc] <= 2).mean()
        score = float(2 * precision * recall / (precision + recall + 1e-12))
        assert score >= .98, (chr(code), score)
        comparisons.append({'character': chr(code), 'inkF1Radius2': score})

    png_comparisons = []
    previews = f"files/dio-handwriting/previews/{state['inputHash']}"
    for name in device('ls', '-1', previews).decode().splitlines():
        name = name.strip()
        if not re.fullmatch(r'\d+\.png', name):
            continue
        code = int(name[:-4])
        pc = np.frombuffer((desktop / f'{code}.gray').read_bytes(), dtype=np.uint8).reshape(128, 128)
        actual = np.asarray(Image.open(io.BytesIO(device('cat', f'{previews}/{name}'))).convert('L'))
        delta = np.abs(pc.astype(int) - actual.astype(int))
        png_comparisons.append({'character': chr(code), 'maxPixelDifference': int(delta.max()), 'meanPixelDifference': float(delta.mean())})
    assert png_comparisons, 'No native preview images were compared'
    report = {
        'nativeState': 'ready', 'mappedHangul': len(codes), 'glyphs': font['maxp'].numGlyphs,
        'fontBytes': len(raw), 'fontSha256': hashlib.sha256(raw).hexdigest(),
        'inputHash': state['inputHash'], 'modelVersion': state['modelVersion'],
        'maxPoints': maximum_points, 'maxContours': maximum_contours,
        'fontRenderComparisons': comparisons, 'phonePreviewVsDesktopPixels': png_comparisons,
        'comparisonMeaning': 'Same input/frozen weights across runtimes plus vectorization; not handwriting-GT similarity.',
    }
    (folder / 'output-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if not isinstance(v, list)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
