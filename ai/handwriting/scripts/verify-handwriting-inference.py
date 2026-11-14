"""Compare isolated upstream/new PyTorch and v1/new ONNX using fixed private inputs.

The upstream tree is imported only in the --original-baseline subprocess.
Existing raw v1 outputs are read, never modified. No handwriting GT is used.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

import numpy as np
import torch

TOOLS = Path(__file__).resolve().parents[1]  # ai/handwriting
FRONTEND = Path(__file__).resolve().parents[3] / 'frontend'
PROBES = list('한이민글핀틔퀭도또루요우')
PROMPTS = '값같곬곶깎넋늪닫닭닻됩뗌략몃밟볘뺐뽈솩쐐앉않얘얾엌옳읊죡쮜춰츄퀭틔핀핥훟'


def write(path, data):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def addresses(character):
    n = ord(character) - 0xac00
    return np.array([[n // 588, 19 + n // 28 % 21, 40 + n % 28]], dtype=np.int64)


def decompose(character):
    ids = addresses(character).copy(); ids[:, 1] -= 19; ids[:, 2] -= 40
    return torch.from_numpy(ids)


def input_tensor(row):
    return torch.from_numpy(np.array(row['pixels'], dtype=np.float32).reshape(1, 1, 128, 128) / 127.5 - 1)


def torch_results(model, rows):
    features, skips = [], []
    def observe(module, inputs, out):
        features.append(out[-1].numpy().copy()); skips.append(out[3].numpy().copy())
    handle = model.component_encoder.register_forward_hook(observe)
    try:
        with torch.inference_mode():
            for row in rows:
                model.encode_write(torch.zeros(1, dtype=torch.long), decompose(row['character']), input_tensor(row), reset_dynamic_memory=False)
            outputs = np.stack([model.read_decode(torch.zeros(1, dtype=torch.long), decompose(c)).numpy() for c in PROBES])
    finally:
        handle.remove()
    return dict(features=np.concatenate(features), skips=np.concatenate(skips), outputs=outputs)


def baseline(args, data):
    import yaml
    sys.path.insert(0, str(args.original_root / 'vendor' / 'dmfont'))
    from models import MACore
    cfg = yaml.safe_load((args.original_root / 'vendor/dmfont/cfgs/kor.yaml').read_text(encoding='utf-8'))
    model = MACore(1, cfg['C'], 1, **cfg['g_args'], n_comps=68, n_comp_types=3, language='kor')
    model.load_state_dict(torch.load(args.checkpoint, map_location='cpu', weights_only=True)['generator_ema'], strict=True)
    model.eval().requires_grad_(False)
    result = torch_results(model, data['inputs'])
    np.savez(args.output / 'original-torch.npz', **result)
    print('Original PyTorch baseline saved in isolated process', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('checkpoint', 'snapshot', 'models', 'baseline-models', 'baseline-rasters', 'output', 'original-root'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--original-baseline', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4); torch.manual_seed(0)
    data = json.loads(args.snapshot.read_text(encoding='utf-8'))
    assert ''.join(r['character'] for r in data['inputs']) == PROMPTS
    if args.original_baseline:
        baseline(args, data); return
    arguments = sys.argv[1:]
    subprocess.run([sys.executable, __file__, *arguments, '--original-baseline'], check=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    sys.path.insert(0, str(TOOLS))
    from dio_dmfont import CHECKPOINT_SHA256, MODEL_VERSION, load_generator
    from dio_dmfont.factory import sha256
    model = load_generator(args.checkpoint)
    candidate = torch_results(model, data['inputs'])
    with np.load(args.output / 'original-torch.npz') as old:
        exact = {key: bool(np.array_equal(candidate[key], old[key])) for key in candidate}
    assert all(exact.values()), exact
    print(json.dumps(dict(stage='PyTorch', exact=exact)), flush=True)
    del candidate, model
    assert not any(n == 'models' or n.startswith('models.') or n == 'datasets' or n.startswith('datasets.') for n in sys.modules)
    baseline_report = json.loads((args.baseline_rasters / 'validation.json').read_text(encoding='utf-8'))
    assert baseline_report['input_hash'] == data['inputHash'] and baseline_report['generated'] == 11172
    assert baseline_report['source_checkpoint_sha256'] == CHECKPOINT_SHA256
    old_hashes = {'encoder.fp32.onnx': '37b11d6788f73c90010bb47121b84c640462a0165a14069f03ecef70f5ade3fc',
                  'decoder.fp32.onnx': '3282f796561b927390acf2adc054f1f9d3223012d6422bfa775e303c65ffd8a2'}
    for name, expected in old_hashes.items():
        assert sha256(args.baseline_models / name) == expected
    import onnxruntime as ort
    options = ort.SessionOptions(); options.intra_op_num_threads=4; options.inter_op_num_threads=1
    def session(folder, name):
        return ort.InferenceSession(str(folder / f'{name}.fp32.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    old_encoder, encoder, decoder = session(args.baseline_models, 'encoder'), session(args.models, 'encoder'), session(args.models, 'decoder')
    main = np.zeros((68, 256, 16, 16), np.float32); skip = np.zeros((68, 128, 32, 32), np.float32); counts = np.zeros(68, np.int32)
    feature_checks = []
    for row in data['inputs']:
        image = input_tensor(row).numpy()
        original = old_encoder.run(None, dict(image=image)); actual = encoder.run(None, dict(image=image))
        errors = [float(np.linalg.norm((a - b).astype(np.float64)) / max(np.linalg.norm(b.astype(np.float64)), 1e-12)) for a, b in zip(actual, original)]
        assert max(errors) < 1e-5, (row['character'], errors)
        feature_checks.append(dict(character=row['character'], relative_l2=errors))
        for role, addr in enumerate(addresses(row['character'])[0]):
            main[addr] += actual[0][0, role]; skip[addr] += actual[1][0, role]; counts[addr] += 1
    assert (counts > 0).all()
    main /= counts[:, None, None, None]; skip /= counts[:, None, None, None]
    del old_encoder, encoder
    signature = dict(input_hash=data['inputHash'], model_version=MODEL_VERSION,
                     model_hashes={n: sha256(args.models / n) for n in old_hashes})
    report_path = args.output / 'equivalence.json'
    if report_path.exists():
        previous = json.loads(report_path.read_text(encoding='utf-8'))
        assert previous['signature'] == signature, 'Use a new output directory for different inputs/models'
    report = dict(status='checking', signature=signature, weights_rights_review='Excluded by task scope',
                  checkpoint_values_exact=True, torch_exact=exact, onnx_features=feature_checks,
                  generated=0, total=11172, pixel_max=0, pixel_mean_max=0., per_character=[],
                  evaluation='Runtime equivalence; not handwriting GT/style similarity')
    started = time.perf_counter()
    for index, code in enumerate(range(0xac00, 0xd7a4)):
        addr = addresses(chr(code))
        raw = decoder.run(None, dict(components=main[addr], skips=skip[addr], component_addresses=addr))[0][0, 0]
        assert np.isfinite(raw).all()
        pixels = np.rint((raw.clip(-1, 1) + 1) * 127.5).astype(np.uint8)
        original = np.frombuffer((args.baseline_rasters / f'{code}.gray').read_bytes(), dtype=np.uint8).reshape(128, 128)
        delta = np.abs(pixels.astype(int) - original.astype(int))
        maximum, mean = int(delta.max()), float(delta.mean())
        assert maximum <= 1 and mean < .001, (chr(code), maximum, mean)
        assert (pixels < 200).sum() >= 8
        (args.output / f'{code}.gray').write_bytes(pixels.tobytes())
        report['generated'] = index + 1; report['pixel_max'] = max(report['pixel_max'], maximum); report['pixel_mean_max'] = max(report['pixel_mean_max'], mean)
        report['per_character'].append(dict(code=code, pixel_max=maximum, pixel_mean=mean))
        if (index+1) % 256 == 0 or index == 11171:
            report['seconds'] = time.perf_counter() - started; write(report_path, report)
            print(json.dumps(dict(stage='all-Hangul', generated=index+1, max=report['pixel_max'], mean_max=report['pixel_mean_max'], seconds=round(report['seconds'], 1))), flush=True)
    report['status'] = 'complete'; write(report_path, report)
    write(args.output / 'validation.json', dict(input_hash=data['inputHash'], generation_seconds=report['seconds'], model_version=MODEL_VERSION, model_hashes=signature['model_hashes']))
    subprocess.run([sys.executable, str(FRONTEND / 'scripts/verify-handwriting-model.py'), '--snapshot', str(args.snapshot), '--models', str(args.models), '--output', str(args.output), '--full'], check=True)
    manifest = json.loads((args.models / 'manifest.json').read_text(encoding='utf-8'))
    manifest['status'] = 'verified; 11172 glyph equivalence and TTF checks passed'
    manifest['verification'] = dict(glyphs=11172, torch_exact=exact, pixel_max=report['pixel_max'], pixel_mean_max=report['pixel_mean_max'])
    write(args.models / 'manifest.json', manifest)


if __name__ == '__main__':
    main()
