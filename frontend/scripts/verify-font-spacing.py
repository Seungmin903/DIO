"""Compare actual legacy, JS-corrected and production Java fonts without altering inputs."""
import argparse
import hashlib
import json
import logging
from pathlib import Path
import subprocess
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

logging.getLogger('fontTools.ttLib.tables._h_e_a_d').setLevel(logging.ERROR)
ROOT = Path(__file__).resolve().parents[1]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(source, output):
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use an empty audit directory')
    output.mkdir(parents=True, exist_ok=True)
    checkpoints = output / 'checkpoints'; checkpoints.mkdir()
    classes = output / 'classes'; classes.mkdir()
    source_hash = sha(source)
    original = TTFont(source, recalcTimestamp=False, recalcBBoxes=False)
    raw = source.read_bytes(); at = original.reader.tables['glyf'].offset
    order = original.getReverseGlyphMap(); locations = original['loca'].locations
    for code in range(0xac00, 0xd7a4):
        gid = order[original.getBestCmap()[code]]
        (checkpoints / f'{code}.gly').write_bytes(raw[at + locations[gid]:at + locations[gid + 1]])
    java = ROOT / 'modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/OutlineFont.java'
    subprocess.run(['javac', '-d', str(classes), str(java)], check=True)
    def build(folder):
        subprocess.run(['java', '-cp', str(classes), 'expo.modules.diohandwriting.OutlineFont', str(folder), 'glyphs', str(checkpoints), 'DIOHW-SpacingAudit', 'Spacing audit'], check=True)
        return folder / 'generated.ttf'
    generated = build(output / 'java')
    corrected = output / 'js.ttf'
    code = '''import{readFileSync,writeFileSync}from'node:fs';import{correctFontSpacing}from'./src/handwriting/fontSpacing.js';writeFileSync(process.argv[2],await correctFontSpacing(new Uint8Array(readFileSync(process.argv[1])),{family:'DIOHW-SpacingAudit',displayName:'Spacing audit'}));'''
    subprocess.run(['node', '--input-type=module', '-e', code, str(source), str(corrected)], cwd=ROOT, check=True)
    js = TTFont(corrected, recalcTimestamp=False, recalcBBoxes=False)
    native = TTFont(generated, recalcTimestamp=False, recalcBBoxes=False)
    points = contours = 0
    for tag in ['glyf', 'loca', 'cmap', 'maxp', 'post']:
        assert original.getTableData(tag) == js.getTableData(tag), tag
    for code in range(0xac00, 0xd7a4):
        name = original.getBestCmap()[code]
        a, b, c = [f['glyf'][f.getBestCmap()[code]] for f in (original, js, native)]
        ca, ea, fa = a.getCoordinates(original['glyf']); cb, eb, fb = b.getCoordinates(js['glyf']); cc, ec, fc = c.getCoordinates(native['glyf'])
        assert list(ca) == list(cb) == list(cc) and list(ea) == list(eb) == list(ec)
        assert list(fa) == list(fb) == list(fc)
        assert js['hmtx'][js.getBestCmap()[code]] == native['hmtx'][native.getBestCmap()[code]] == (a.xMax - a.xMin + 32, 16)
        points += len(ca); contours += a.numberOfContours
    assert original['hmtx']['space'] == js['hmtx']['space'] == native['hmtx']['space']
    for font in [js, native]:
        assert not font['head'].flags & 2
        assert font['hhea'].ascent == original['hhea'].ascent and font['hhea'].descent == original['hhea'].descent
    # Check that old/mixed checkpoint data produces the same new font.
    packed = generated.read_bytes(); gstart = native.reader.tables['glyf'].offset; ids = native.getReverseGlyphMap()
    for code in range(0xac01, 0xd7a4, 2):
        gid = ids[native.getBestCmap()[code]]; loc = native['loca'].locations
        (checkpoints / f'{code}.gly').write_bytes(packed[gstart + loc[gid]:gstart + loc[gid + 1]])
    resumed = build(output / 'mixed')
    assert generated.read_bytes() == resumed.read_bytes()
    refusal = subprocess.run(['java', '-cp', str(classes), 'expo.modules.diohandwriting.OutlineFont', str(output / 'java'), 'glyphs', str(checkpoints)], capture_output=True)
    assert refusal.returncode != 0 and generated.read_bytes() == resumed.read_bytes()
    # Regression: empty, zero-width and out-of-canvas checkpoint headers.
    saved = {code: (checkpoints / f'{code}.gly').read_bytes() for code in range(0xac00, 0xac03)}
    import struct
    try:
        (checkpoints / '44032.gly').write_bytes(b'')
        flat = bytearray(saved[0xac01]); flat[6:8] = flat[2:4]
        (checkpoints / '44033.gly').write_bytes(flat)
        outside = bytearray(saved[0xac02]); struct.pack_into('>h', outside, 2, -16); struct.pack_into('>h', outside, 6, 2064)
        (checkpoints / '44034.gly').write_bytes(outside)
        edge = TTFont(build(output / 'edge-cases'), recalcTimestamp=False)
        assert len(edge.getBestCmap()) == 11173
        for code in [0xac00, 0xac01]:
            name = edge.getBestCmap()[code]
            assert edge['hmtx'][name] == (1024, 0)
            assert edge['glyf'][name].numberOfContours == 0
        assert edge['hmtx'][edge.getBestCmap()[0xac02]] == (2080, 16)
    finally:
        for code, data in saved.items(): (checkpoints / f'{code}.gly').write_bytes(data)
    print('PASS empty, degenerate and out-of-canvas glyph checkpoints', flush=True)
    raster = []
    common = list(map(ord, '이가기횡뿜핀한민글값핥훟틔퀭오늘의기록손씨'))
    for size in [24, 48, 128, 256]:
        codes = range(0xac00, 0xd7a4) if size == 128 else common
        old_font, new_font = ImageFont.truetype(str(source), size), ImageFont.truetype(str(corrected), size)
        changed = 0
        for charcode in codes:
            text = chr(charcode); glyph = original['glyf'][original.getBestCmap()[charcode]]
            shift = (glyph.xMin - 16) * size / 2048
            a = Image.new('L', (size * 2 + 64, size * 2 + 64)); b = Image.new('L', a.size)
            ImageDraw.Draw(a).text((16, size + 16), text, font=old_font, fill=255, anchor='ls')
            ImageDraw.Draw(b).text((16 + shift, size + 16), text, font=new_font, fill=255, anchor='ls')
            if a.tobytes() != b.tobytes(): changed += 1
        raster.append(dict(size=size, compared=len(codes), changedAfterPositionCompensation=changed))
        print(raster[-1], flush=True)
    # 128px is the source grid: the translation is an exact integer pixel.
    assert next(r for r in raster if r['size'] == 128)['changedAfterPositionCompensation'] == 0
    image = Image.new('RGB', (1320, 390), 'white'); draw = ImageDraw.Draw(image)
    sentence = '오늘의 기록을 내 글씨로 남겨요. 이가횡핀한민글'
    for y, path, caption in [(55, source, 'Before: fixed width'), (235, corrected, 'After: ink width + 2px')]:
        draw.text((24, y - 35), caption, fill='#666666')
        draw.text((24, y), sentence, font=ImageFont.truetype(str(path), 48), fill='#111111')
    image.save(output / 'comparison.png')
    assert sha(source) == source_hash
    report = dict(status='passed', syllables=11172, glyphDataByteIdentical=True, points=points, contours=contours,
                  nativeAndJsMetricsEqual=True, mixedCheckpointsByteEqual=True, completedOverwriteRejected=True,
                  sourceUnchanged=True, sourceBytes=source.stat().st_size, correctedBytes=corrected.stat().st_size,
                  nativeBytes=generated.stat().st_size, raster=raster, physicalDeviceTested=False)
    (output / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path); parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(); run(args.source.resolve(), args.output.resolve())
