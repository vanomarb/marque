import { fromStored, isSelection, sameSelection, type Selection, type StoredSelection } from './estimate.ts'

/** The part of Storage this module uses, so tests can pass a stand-in. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// The Privacy and Cookie pages list both keys; a test reads them from here.
export const ACCOUNT_KEY = 'marque.account'
export const BRIEFS_KEY = 'marque.briefs'
export const MAX_BRIEFS = 12

export type Contact = { kind: 'email'; value: string }

export interface Session {
  /** Asked when an account is created; signing in with email alone leaves it null. */
  firstName: string | null
  contact: Contact
}

export interface Brief {
  id: string
  /** ISO timestamp. */
  savedAt: string
  selection: Selection
}

/** The header partial's script copies EMAIL; a test holds the copy to it. */
export const EMAIL = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/
/** The studio replies by email, wherever the client is. */
export function parseContact(input: string): Contact | null {
  const text = input.trim()
  return EMAIL.test(text) ? { kind: 'email', value: text } : null
}

/** "a••••@example.com". */
export function maskContact(contact: Contact): string {
  const [local, domain] = contact.value.split('@')
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}

export function validateFirstName(name: string): string | null {
  const text = name.trim()
  if (!text) return 'Add the first name for the file.'
  if (text.length > 40) return 'Keep it to 40 characters.'
  return null
}

export function demoCode(random: () => number = Math.random): string {
  return String(1000 + Math.floor(random() * 9000))
}

export function codeMatches(entered: string, expected: string): boolean {
  const digits = entered.replace(/\s/g, '')
  return digits.length > 0 && digits === expected
}

function read(store: KeyValueStore | null, key: string): unknown {
  try {
    const text = store?.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function write(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false
  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function isSession(value: unknown): value is Session {
  const v = value as Session | null
  const name: unknown = v?.firstName
  return (
    !!v &&
    (name === undefined || name === null || (typeof name === 'string' && validateFirstName(name) === null)) &&
    !!v.contact &&
    v.contact.kind === 'email' &&
    typeof v.contact.value === 'string' &&
    parseContact(v.contact.value) !== null
  )
}

export function loadSession(store: KeyValueStore | null): Session | null {
  const value = read(store, ACCOUNT_KEY)
  return isSession(value) ? { firstName: value.firstName ? value.firstName.trim() : null, contact: { kind: 'email', value: value.contact.value.trim() } } : null
}

/** What the header calls a signed-in visitor: their first name, or their email address when they gave no name. */
export function accountLabel(session: Session): string {
  return session.firstName ? session.firstName.split(/\s+/)[0] : session.contact.value
}

export function saveSession(store: KeyValueStore | null, session: Session): boolean {
  return write(store, ACCOUNT_KEY, session)
}

export function clearSession(store: KeyValueStore | null): void {
  try {
    store?.removeItem(ACCOUNT_KEY)
  } catch {
    // Storage is blocked: there is no session to clear.
  }
}

type StoredBrief = Omit<Brief, 'selection'> & { selection: StoredSelection }

function isBrief(value: unknown): value is StoredBrief {
  const v = value as StoredBrief | null
  return !!v && typeof v.id === 'string' && v.id.length > 0 && typeof v.savedAt === 'string' && !Number.isNaN(Date.parse(v.savedAt)) && isSelection(v.selection)
}

/** Newest first; damaged records are dropped, and a website saved before the managed choice reads as handed over. */
export function loadBriefs(store: KeyValueStore | null): Brief[] {
  const value = read(store, BRIEFS_KEY)
  const list: Brief[] = Array.isArray(value) ? value.filter(isBrief).map((b) => ({ id: b.id, savedAt: b.savedAt, selection: fromStored(b.selection) })) : []
  return list.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export type SaveResult =
  /** `removed` old briefs went to stay within MAX_BRIEFS. */
  | { status: 'saved'; brief: Brief; removed: number }
  /** The newest brief already has this selection. */
  | { status: 'already-saved'; brief: Brief }
  /** The browser won't keep it. */
  | { status: 'not-saved' }

export function saveBrief(store: KeyValueStore | null, selection: Selection, now: Date = new Date()): SaveResult {
  if (!store) return { status: 'not-saved' }
  const briefs = loadBriefs(store)
  if (briefs[0] && sameSelection(briefs[0].selection, selection)) return { status: 'already-saved', brief: briefs[0] }
  const brief: Brief = { id: `b${now.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, savedAt: now.toISOString(), selection }
  const all = [brief, ...briefs]
  const kept = all.slice(0, MAX_BRIEFS)
  return write(store, BRIEFS_KEY, kept) ? { status: 'saved', brief, removed: all.length - kept.length } : { status: 'not-saved' }
}

/** False when the browser didn't keep the change, so the brief is still there. */
export function removeBrief(store: KeyValueStore | null, id: string): boolean {
  const kept = loadBriefs(store).filter((b) => b.id !== id)
  return write(store, BRIEFS_KEY, kept)
}
