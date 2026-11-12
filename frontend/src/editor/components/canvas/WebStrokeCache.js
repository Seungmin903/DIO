// Native callers retain the original vector objects even if a shared provider enables caching.
export default function WebStrokeCache({ objects, renderObject }) {
  return objects.filter(object => !object.hidden).map(renderObject)
}
