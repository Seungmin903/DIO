// Fast paths use immutable shared references; changed values still compare in full.
export function sameQASnapshot(a, b) {
  if (a === b) return true
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((value, i) => sameQASnapshot(value, b[i]))
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameQASnapshot(a[key], b[key]))
}
