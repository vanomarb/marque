import { codeMatches, emailProblem, oneTimeCode, parseEmail, validateFirstName, type Session } from '../account.ts'
import { readJson, removeItem, writeJson, type KeyValueStore } from './storage.ts'
import type { AuthBackend } from './types.ts'

// The Privacy and Cookie pages list this key; a test reads it from here.
export const ACCOUNT_KEY = 'marque.account'

/** The stored session, by the same rules as the header partial's first-paint script (a test runs both). */
export function readSession(store: KeyValueStore | null): Session | null {
  const value = readJson(store, ACCOUNT_KEY)
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const name = record.firstName
  const nameOk = name === undefined || name === null || (typeof name === 'string' && validateFirstName(name) === null)
  const address = typeof record.email === 'string' ? parseEmail(record.email) : null
  return nameOk && address ? { firstName: typeof name === 'string' ? name.trim() : null, email: address } : null
}

/** Sign-in on this device only: the code comes back as a preview instead of being emailed. With storage blocked, the session lives in memory until the page is left. */
export function createLocalAuth(store: KeyValueStore | null, options: { code?: () => string; onSignIn?: (email: string) => void } = {}): AuthBackend {
  const makeCode = options.code ?? (() => oneTimeCode())
  let pending: { session: Session; code: string } | null = null
  let memory: Session | null = null

  return {
    async startEmailSignIn(email, firstName) {
      const emailError = emailProblem(email)
      if (emailError) return { status: 'invalid', field: 'email', message: emailError }
      const nameError = firstName === undefined ? null : validateFirstName(firstName)
      if (nameError) return { status: 'invalid', field: 'firstName', message: nameError }
      const address = parseEmail(email)!
      pending = { session: { firstName: firstName === undefined ? null : firstName.trim(), email: address }, code: makeCode() }
      return { status: 'sent', email: address, preview: pending.code }
    },

    async verifyCode(email, code) {
      if (!pending || pending.session.email !== parseEmail(email)) return { status: 'expired' }
      if (!codeMatches(code, pending.code)) return { status: 'wrong-code' }
      const { session } = pending
      pending = null
      const remembered = writeJson(store, ACCOUNT_KEY, session)
      memory = remembered ? null : session
      options.onSignIn?.(session.email)
      return { status: 'signed-in', session, remembered }
    },

    async startGoogleSignIn() {
      return { status: 'not-connected' }
    },

    async currentSession() {
      return readSession(store) ?? memory
    },

    async signOut() {
      removeItem(store, ACCOUNT_KEY)
      memory = null
      pending = null
    },
  }
}
