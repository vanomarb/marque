// What the UI codes against; network adapters replace the local-*.ts ones in index.ts (BACKEND.md maps the endpoints).
// Every method resolves and none throws: a failure is a result the UI shows.

import type { Brief, Session } from '../account.ts'
import type { ContactErrors, ContactInput } from '../contact.ts'
import type { Selection } from '../estimate.ts'

/** Saved briefs per person, newest kept. Every adapter holds to it. */
export const MAX_BRIEFS = 12

export type CodeRequest =
  /** `preview` is the code itself while emails aren't sent, for the page to show; null once the email carries it. */
  | { status: 'sent'; email: string; preview: string | null }
  | { status: 'invalid'; field: 'email' | 'firstName'; message: string }
  | { status: 'failed'; message: string }

export type CodeCheck =
  /** `remembered` is false when the browser won't keep the session, so leaving the page signs out. */
  | { status: 'signed-in'; session: Session; remembered: boolean }
  | { status: 'wrong-code' }
  /** No code is waiting for this address: never asked for, already used, or timed out. */
  | { status: 'expired' }
  | { status: 'failed'; message: string }

export type GoogleStart = { status: 'redirect'; url: string } | { status: 'not-connected' } | { status: 'failed'; message: string }

export interface AuthBackend {
  /** Asks for a one-time code. `firstName` only when creating an account; both are checked before anything is sent. */
  startEmailSignIn(email: string, firstName?: string): Promise<CodeRequest>
  /** Checks a code against the last one sent to `email`. A code works once; briefs saved signed out join the account. */
  verifyCode(email: string, code: string): Promise<CodeCheck>
  /** Where to send the browser for Google, or that Google isn't connected. */
  startGoogleSignIn(): Promise<GoogleStart>
  currentSession(): Promise<Session | null>
  signOut(): Promise<void>
}

export type SaveResult =
  /** `dropped` old briefs went to stay within MAX_BRIEFS. */
  | { status: 'saved'; brief: Brief; dropped: number }
  /** The newest brief already has this selection, so no copy was added. */
  | { status: 'already-saved'; brief: Brief }
  /** The browser won't keep it. */
  | { status: 'not-saved' }
  | { status: 'failed'; message: string }

export type RemoveResult =
  | { status: 'removed' }
  /** Already gone (another tab, a second press), so the page treats it as removed. */
  | { status: 'not-found' }
  /** The browser won't change what it keeps, so the brief is still there. */
  | { status: 'not-removed' }
  | { status: 'failed'; message: string }

export interface BriefsBackend {
  /**
   * The signed-in person's briefs and those saved signed out, newest first, at most MAX_BRIEFS. Damaged records are
   * dropped, and older ones keep the prices they were saved with.
   */
  list(): Promise<Brief[]>
  save(selection: Selection): Promise<SaveResult>
  remove(id: string): Promise<RemoveResult>
}

export type SendResult =
  | { status: 'sent' }
  /** Checked and fine, but there is nowhere to send it yet. */
  | { status: 'not-connected' }
  | { status: 'invalid'; errors: ContactErrors }
  | { status: 'failed'; message: string }

export interface ContactBackend {
  send(message: ContactInput): Promise<SendResult>
}

export type SubscribeResult =
  /** A confirmation email is on its way (double opt-in). */
  | { status: 'subscribed' }
  | { status: 'not-connected' }
  | { status: 'invalid'; message: string }
  | { status: 'failed'; message: string }

export interface NewsletterBackend {
  subscribe(email: string): Promise<SubscribeResult>
}

export interface Backend {
  auth: AuthBackend
  briefs: BriefsBackend
  contact: ContactBackend
  newsletter: NewsletterBackend
}
