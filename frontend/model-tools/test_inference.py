"""Small contract tests for the new inference boundary; no private data needed."""
import importlib.abc
from pathlib import Path
import sys
import unittest

import torch


class RejectOriginalImports(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'models', 'datasets', 'trainer'}:
            raise AssertionError(f'Forbidden original import: {fullname}')


sys.meta_path.insert(0, RejectOriginalImports())
from dio_dmfont.tensor_ops import split_dim
from dio_dmfont.modules.blocks import ConvBlock, ResBlock, w_norm_dispatch


class InferenceContracts(unittest.TestCase):
    def test_axis_split_preserves_values_and_gradient(self):
        values = torch.arange(48., requires_grad=True)
        matrix = values.reshape(2, 6, 4)
        result = split_dim(matrix, 1, 3)
        self.assertEqual(result.shape, (2, 3, 2, 4))
        self.assertTrue(torch.equal(result.flatten(), values))
        result.sum().backward()
        self.assertTrue(torch.equal(values.grad, torch.ones_like(values)))
        self.assertEqual(split_dim(matrix, -1, 2).shape, (2, 6, 2, 2))

    def test_invalid_split_is_reported(self):
        x = torch.zeros(2, 5)
        for axis, groups in [(1, 2), (2, 1), (0, 0), (0, -1), (0, True)]:
            with self.subTest(axis=axis, groups=groups), self.assertRaises(ValueError):
                split_dim(x, axis, groups)

    def test_no_weight_norm_is_identity_and_propagates_through_residual(self):
        layer = torch.nn.Linear(3, 2)
        self.assertIs(w_norm_dispatch('none')(layer), layer)
        block = ResBlock(4, 8)
        self.assertEqual(block(torch.zeros(1, 4, 8, 8)).shape, (1, 8, 8, 8))

    def test_unsupported_normalization_is_not_silently_replaced(self):
        for value in ['spectral', 'weight', lambda x: x]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "w_norm='none'"):
                ConvBlock(1, 4, w_norm=value)

    def test_package_does_not_ship_restricted_or_training_helpers(self):
        import dio_dmfont
        root = Path(dio_dmfont.__file__).parent
        self.assertFalse((root / 'modules' / 'modules.py').exists())
        for path in root.rglob('*.py'):
            source = path.read_text(encoding='utf-8')
            self.assertNotIn('def weights_init', source)
            self.assertNotIn('def spectral_norm', source)
            self.assertNotIn('from models', source)
            self.assertNotIn('import datasets', source)


if __name__ == '__main__':
    unittest.main()
