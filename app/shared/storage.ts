import type { KeyValueStore } from '../lib/account.ts'

/** Null when the browser blocks storage; writes that still fail are caught in lib/account.ts. */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
