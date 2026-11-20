import { validateContact } from '../contact.ts'
import type { ContactBackend } from './types.ts'

/** Checks the message the way the server will, then reports that there is nowhere to send it yet. */
export function createLocalContact(): ContactBackend {
  return {
    async send(message) {
      const errors = validateContact(message)
      return Object.keys(errors).length ? { status: 'invalid', errors } : { status: 'not-connected' }
    },
  }
}
