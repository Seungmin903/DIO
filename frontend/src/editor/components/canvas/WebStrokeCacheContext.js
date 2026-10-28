import { createContext } from 'react'
// null uses the production policy; explicit booleans are isolated QA overrides.
export const WebStrokeCacheEnabled = createContext(null)

// Explicit QA provider only; production has no preparation gate.
export const WebStrokeCachePreparation = createContext(null)
