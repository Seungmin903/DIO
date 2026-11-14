"""Korean DM-Font inference. See PROVENANCE.json and UPSTREAM_LICENSE."""

from .ma_core import MACore
from .factory import CHECKPOINT_SHA256, MODEL_VERSION, load_generator

__all__ = ['MACore', 'CHECKPOINT_SHA256', 'MODEL_VERSION', 'load_generator']
