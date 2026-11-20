import { emailProblem } from '../account.ts'
import type { NewsletterBackend } from './types.ts'

/** Checks the address the way the server will, then reports that sign-up isn't connected yet. */
export function createLocalNewsletter(): NewsletterBackend {
  return {
    async subscribe(email) {
      const problem = emailProblem(email)
      return problem ? { status: 'invalid', message: problem } : { status: 'not-connected' }
    },
  }
}
