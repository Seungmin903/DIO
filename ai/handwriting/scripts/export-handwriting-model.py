"""Export the local DIO inference package; no upstream Python tree is needed."""
import sys
sys.dont_write_bytecode = True
import argparse
from collections import Counter
import json
from pathlib import Path
import shutil
import time

import numpy as np
import onnx
import onnxruntime as ort
import torch

TOOLS = Path(__file__).resolve().parents[1]  # ai/handwriting
sys.path.insert(0, str(TOOLS))
from dio_dmfont import CHECKPOINT_SHA256, MODEL_VERSION, load_generator
from dio_dmfont.factory import sha256
from dio_dmfont.mobile import deployment_modules


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if any(args.output.glob('*.onnx')):
        raise ValueError('Use a new output directory; existing models are preserved')
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    torch.manual_seed(0)
    generator = load_generator(args.checkpoint)
    report = dict(model='DM-Font', model_version=MODEL_VERSION,
                  original_commit='488a8e823920d94ea3f544bad9fe8e34929d8c04',
                  original_checkpoint_sha256=CHECKPOINT_SHA256, precision='float32',
                  batch=1, image_resolution=[128, 128], input_normalization='gray/127.5 - 1',
                  preprocess_version='dio-ink-safe90-margin4-fp32-v2',
                  versions=dict(torch=torch.__version__, onnx=onnx.__version__, desktop_onnxruntime=ort.__version__, android_onnxruntime='1.23.2'),
                  state_dict_tensors=len(generator.state_dict()), checkpoint_values_exact=True,
                  files={}, input_contract={}, source_files={}, weights_rights_review='Excluded by task scope')
    for path in sorted((TOOLS / 'dio_dmfont').rglob('*.py')):
        report['source_files'][path.relative_to(TOOLS).as_posix()] = sha256(path)
    encoder, decoder = deployment_modules(generator)
    examples = [('encoder', encoder, (torch.zeros(1, 1, 128, 128),), ['image'], ['components', 'skips']),
                ('decoder', decoder, (torch.zeros(1, 3, 256, 16, 16), torch.zeros(1, 3, 128, 32, 32), torch.tensor([[0, 19, 40]])), ['components', 'skips', 'component_addresses'], ['glyph'])]
    with torch.inference_mode():
        for name, module, inputs, input_names, output_names in examples:
            path = args.output / f'{name}.fp32.onnx'
            started = time.perf_counter()
            torch.onnx.export(module, inputs, str(path), input_names=input_names, output_names=output_names,
                              opset_version=18, export_params=True, do_constant_folding=True, dynamo=False)
            graph = onnx.load(path)
            onnx.checker.check_model(graph, full_check=True)
            if any(node.domain not in ('', 'ai.onnx') for node in graph.graph.node):
                raise ValueError('Unexpected custom ONNX operator')
            options = ort.SessionOptions(); options.intra_op_num_threads = 4; options.inter_op_num_threads = 1
            session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
            actual = session.run(None, {n: t.numpy() for n, t in zip(input_names, inputs)})
            expected = module(*inputs); expected = (expected,) if torch.is_tensor(expected) else expected
            errors = [float(np.max(np.abs(a - b.numpy()))) for a, b in zip(actual, expected)]
            if not all(np.isfinite(a).all() for a in actual):
                raise ValueError('Non-finite ONNX output')
            contract = {t.name: [d.dim_value for d in t.type.tensor_type.shape.dim] for t in graph.graph.input}
            report['input_contract'][name] = contract
            report['files'][path.name] = dict(sha256=sha256(path), bytes=path.stat().st_size,
                                             sample_max_abs_error=errors, seconds=time.perf_counter()-started,
                                             operators=dict(Counter(n.op_type for n in graph.graph.node)))
            print(json.dumps(dict(stage='export', model=name, sha256=report['files'][path.name]['sha256'], max_abs=errors)), flush=True)
            del session, graph
    loaded = {name: str(getattr(module, '__file__', '')) for name, module in sys.modules.items() if name.startswith(('dio_dmfont', 'models', 'datasets'))}
    if any(name == 'models' or name.startswith('models.') or name == 'datasets' or name.startswith('datasets.') for name in loaded):
        raise ValueError('Original upstream package leaked into the new exporter')
    report['inference_imports'] = loaded
    report['status'] = 'exported; equivalence verification required before app preparation'
    (args.output / 'export-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    public_manifest = {key: value for key, value in report.items() if key != 'inference_imports'}
    (args.output / 'manifest.json').write_text(json.dumps(public_manifest, indent=2), encoding='utf-8')
    shutil.copy2(TOOLS / 'dio_dmfont' / 'UPSTREAM_LICENSE', args.output / 'LICENSE')
    shutil.copy2(TOOLS / 'NOTICE', args.output / 'NOTICE')


if __name__ == '__main__':
    main()
