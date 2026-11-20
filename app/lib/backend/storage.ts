/** The part of Storage the local adapters use, so tests can pass a stand-in. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Null when the browser blocks storage; writes that still fail are caught below. */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Null for a missing, blocked or damaged item. */
export function readJson(store: KeyValueStore | null, key: string): unknown {
  try {
    const text = store?.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

/** False when the browser didn't keep it. */
export function writeJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false
  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeItem(store: KeyValueStore | null, key: string): void {
  try {
    store?.removeItem(key)
  } catch {
    // Storage is blocked: there is nothing kept to remove.
  }
}
