"""Original DIO fixed inference configuration and checkpoint integrity checks."""

import hashlib
from pathlib import Path

import torch

from .ma_core import MACore

MODEL_VERSION = 'dmfont-fp32-e5b28ca6-inference-v2'
CHECKPOINT_SHA256 = 'e5b28ca6793429b5e8bc77ed07ef166c7dfce91e089f068cc86318897700cae0'


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load_generator(checkpoint):
    if sha256(checkpoint) != CHECKPOINT_SHA256:
        raise ValueError('Unexpected original checkpoint hash')
    model = MACore(
        1, 32, 1, n_comps=68, n_comp_types=3, language='kor',
        comp_enc=dict(norm='none', activ='relu', pad_type='zero',
                      sa=dict(C_qk_ratio=.5, n_heads=2, area=False, ffn_mult=2)),
        dec=dict(norm='IN', activ='relu', pad_type='zero'),
    )
    state = torch.load(checkpoint, map_location='cpu', weights_only=True)['generator_ema']
    model.load_state_dict(state, strict=True)
    for key, actual in model.state_dict().items():
        if not torch.equal(actual, state[key]):
            raise ValueError(f'Checkpoint tensor changed: {key}')
    return model.eval().requires_grad_(False)
