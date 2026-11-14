"""Original DIO tensor shape utilities, implemented with public PyTorch APIs.

Contract: replace axis D of an N-dimensional tensor by (groups, D/groups).
No element is reordered. No upstream helper implementation is included.
"""

import torch


def split_dim(tensor, dim, n_chunks):
    axis = dim + tensor.ndim if dim < 0 else dim
    if not 0 <= axis < tensor.ndim:
        raise ValueError('split dimension is outside the tensor rank')
    # During fixed-shape ONNX tracing the batch dimension can be a scalar tensor.
    if not torch.jit.is_tracing():
        if not isinstance(n_chunks, int) or isinstance(n_chunks, bool) or n_chunks <= 0:
            raise ValueError('number of groups must be a positive integer')
        if tensor.shape[axis] % n_chunks:
            raise ValueError('dimension must be divisible by the number of groups')
    return torch.unflatten(tensor, axis, (n_chunks, tensor.shape[axis] // n_chunks))
