// build/site.ts is the one place the site's base path is set; it has no Node-only code.
import { BASE } from '../../build/site.ts'
import type { Selection } from './estimate.ts'

// Pure account rules. Keeping sessions and briefs is a backend concern: see backend/.

export interface Session {
  /** Asked when an account is created; signing in with email alone leaves it null. */
  firstName: string | null
  email: string
}

export interface Brief {
  id: string
  /** ISO timestamp. */
  savedAt: string
  selection: Selection
}

/** The longest first name and email address the sign-in form takes; its inputs carry the same limits. */
export const FIRST_NAME_MAX = 40
export const EMAIL_MAX = 254

/** The header partial's script copies EMAIL; a test holds the copy to it. */
export const EMAIL = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/

/** The address without the spaces round it, or null when it isn't one. */
export function parseEmail(input: string): string | null {
  const text = input.trim()
  return EMAIL.test(text) ? text : null
}

/** "a•••@example.com", as wide for a long address as for a short one. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  return `${email.slice(0, 1)}•••${email.slice(at)}`
}

export function validateFirstName(name: string): string | null {
  const text = name.trim()
  if (!text) return 'Enter your first name so we can file your briefs under it.'
  if (text.length > FIRST_NAME_MAX) return `Keep it to ${FIRST_NAME_MAX} characters.`
  return null
}

/** The message every form shows for an address that isn't one, or null when it is. */
export function emailProblem(input: string): string | null {
  if (!input.trim()) return 'Enter your email address.'
  return parseEmail(input) ? null : 'Enter an email address, like name@example.com.'
}

/** Four digits, 1000 to 9999. */
export function oneTimeCode(random: () => number = Math.random): string {
  return String(1000 + Math.floor(random() * 9000))
}

export function codeMatches(entered: string, expected: string): boolean {
  const digits = entered.replace(/\s/g, '')
  return digits.length > 0 && digits === expected
}

/** The ?next= page to return to after signing in, if it is a path on this site; null for anything else. */
export function safeNext(search: string, origin: string): string | null {
  const raw = new URLSearchParams(search).get('next')
  if (!raw || !raw.startsWith(BASE) || raw.includes('\\')) return null
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return null
  }
  return url.origin === origin && url.pathname.startsWith(BASE) ? `${url.pathname}${url.search}${url.hash}` : null
}

/** What the header calls a signed-in visitor: their first name, or the part of their address before the @. */
export function accountLabel(session: Session): string {
  return session.firstName ? session.firstName.split(/\s+/)[0] : session.email.slice(0, session.email.lastIndexOf('@'))
}
