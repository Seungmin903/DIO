// Zoom/pixel-aligned bounds may change; only identical original objects may reuse pixels.
export function reusableStrokeRaster(previous, batch) {
  return Boolean(previous && previous.width === batch.width && previous.height === batch.height
    && previous.objects.length === batch.objects.length
    && previous.objects.every((object, index) => object === batch.objects[index]))
}
