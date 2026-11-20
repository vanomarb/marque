import { isSelection, sameSelection, type Selection } from './estimate.ts'

/** The part of Storage this module uses, so tests can pass a stand-in. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// The Privacy and Cookie pages list both keys; a test reads them from here.
export const ACCOUNT_KEY = 'marque.account'
export const BRIEFS_KEY = 'marque.briefs'
export const MAX_BRIEFS = 12

export type Contact = { kind: 'email' | 'mobile'; value: string }

export interface Session {
  firstName: string
  contact: Contact
}

export interface Brief {
  id: string
  /** ISO timestamp. */
  savedAt: string
  selection: Selection
}

/** The header partial's script copies EMAIL and MOBILE; a test holds the copies to these. */
export const EMAIL = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/
/** A Philippine mobile number once spaces, dashes and brackets are gone: 09…, +63 9…, 63 9…, or the bare ten digits 9…. */
export const MOBILE = /^(?:\+?63|0)?(9\d{9})$/

/** Mobile numbers come back in the 09… form. */
export function parseContact(input: string): Contact | null {
  const text = input.trim()
  if (EMAIL.test(text)) return { kind: 'email', value: text }
  const mobile = text.replace(/[\s().-]/g, '').match(MOBILE)
  return mobile ? { kind: 'mobile', value: `0${mobile[1]}` } : null
}

/** "a••••@example.com" or "0917 ••• 4567". */
export function maskContact(contact: Contact): string {
  if (contact.kind === 'mobile') return `${contact.value.slice(0, 4)} ••• ${contact.value.slice(-4)}`
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
  return (
    !!v &&
    typeof v.firstName === 'string' &&
    validateFirstName(v.firstName) === null &&
    !!v.contact &&
    (v.contact.kind === 'email' || v.contact.kind === 'mobile') &&
    typeof v.contact.value === 'string' &&
    parseContact(v.contact.value) !== null
  )
}

export function loadSession(store: KeyValueStore | null): Session | null {
  const value = read(store, ACCOUNT_KEY)
  return isSession(value) ? { firstName: value.firstName.trim(), contact: value.contact } : null
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

function isBrief(value: unknown): value is Brief {
  const v = value as Brief | null
  return !!v && typeof v.id === 'string' && v.id.length > 0 && typeof v.savedAt === 'string' && !Number.isNaN(Date.parse(v.savedAt)) && isSelection(v.selection)
}

/** Newest first; damaged records are dropped. */
export function loadBriefs(store: KeyValueStore | null): Brief[] {
  const value = read(store, BRIEFS_KEY)
  const list = Array.isArray(value) ? value.filter(isBrief) : []
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
