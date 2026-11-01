"""SAM 2 기반 '붓으로 골라 따기' 세그멘테이션.

무거운 이미지 인코딩은 사진당 한 번만 하고(embed), 탭할 때마다는 가벼운 마스크 디코딩만 한다(segment).
"""
import os
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image
from transformers import Sam2Model, Sam2Processor

MODEL_ID = os.getenv("SAM2_MODEL_ID", "facebook/sam2.1-hiera-tiny")
DEVICE = os.getenv("SAM2_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MAX_SIDE = int(os.getenv("SAM2_MAX_SIDE", "1536"))
CACHE_SIZE = int(os.getenv("SAM2_CACHE_SIZE", "32"))
CACHE_TTL_SEC = int(os.getenv("SAM2_CACHE_TTL_SEC", "1800"))


@dataclass
class EmbeddedImage:
    image: Image.Image
    original_sizes: torch.Tensor
    embeddings: list[torch.Tensor]
    used_at: float = 0.0


class Segmenter:
    def __init__(self) -> None:
        self.processor = Sam2Processor.from_pretrained(MODEL_ID)
        self.model = Sam2Model.from_pretrained(MODEL_ID).to(DEVICE).eval()
        self._cache: OrderedDict[str, EmbeddedImage] = OrderedDict()
        self._lock = threading.Lock()

    def embed(self, image: Image.Image) -> tuple[str, float]:
        image = image.convert("RGB")
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        start = time.perf_counter()
        inputs = self.processor(images=image, return_tensors="pt").to(DEVICE)
        with torch.inference_mode():
            embeddings = self.model.get_image_embeddings(inputs["pixel_values"])
        elapsed = time.perf_counter() - start

        image_id = uuid.uuid4().hex
        with self._lock:
            self._cache[image_id] = EmbeddedImage(image, inputs["original_sizes"], embeddings, time.monotonic())
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return image_id, elapsed

    def get(self, image_id: str) -> EmbeddedImage | None:
        """마지막 사용 후 CACHE_TTL_SEC 가 지난 사진은 만료로 보고 지운다."""
        now = time.monotonic()
        with self._lock:
            item = self._cache.get(image_id)
            if item is None:
                return None
            if now - item.used_at > CACHE_TTL_SEC:
                del self._cache[image_id]
                return None
            item.used_at = now
            self._cache.move_to_end(image_id)
            return item

    def segment(self, item: EmbeddedImage, points: list[tuple[float, float, int]]) -> tuple[np.ndarray, float]:
        """points: (x, y, label) — x, y 는 0~1 비율 좌표, label 1=포함 / 0=제외. bool 마스크(H, W)를 반환."""
        w, h = item.image.size
        input_points = [[[[x * w, y * h] for x, y, _ in points]]]
        input_labels = [[[label for _, _, label in points]]]
        start = time.perf_counter()
        inputs = self.processor(input_points=input_points, input_labels=input_labels,
                                original_sizes=item.original_sizes, return_tensors="pt").to(DEVICE)
        # 점이 하나면 후보 3개 중 점수 높은 걸 고르고, 여러 개면 단일 마스크로 충분하다.
        multimask = len(points) == 1
        with torch.inference_mode():
            outputs = self.model(input_points=inputs["input_points"], input_labels=inputs["input_labels"],
                                 image_embeddings=item.embeddings, multimask_output=multimask)
        masks = self.processor.post_process_masks(outputs.pred_masks.cpu(), item.original_sizes.cpu())[0]
        best = int(outputs.iou_scores[0, 0].argmax()) if multimask else 0
        elapsed = time.perf_counter() - start
        return masks[0, best].numpy().astype(bool), elapsed
