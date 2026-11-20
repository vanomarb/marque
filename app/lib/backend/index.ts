import { createLocalAuth, readSession } from './local-auth.ts'
import { claimBriefs, createLocalBriefs } from './local-briefs.ts'
import { createLocalContact } from './local-contact.ts'
import { createLocalNewsletter } from './local-newsletter.ts'
import { browserStore, type KeyValueStore } from './storage.ts'
import type { Backend } from './types.ts'

export type { Backend } from './types.ts'

/** Everything on this device: sign-in and briefs in `store`, the forms checked but not sent. */
export function createLocalBackend(store: KeyValueStore | null, options: { code?: () => string } = {}): Backend {
  const auth = createLocalAuth(store, { ...options, onSignIn: (email) => claimBriefs(store, email) })
  const session = readSession(store)
  if (session) claimBriefs(store, session.email)
  const briefs = createLocalBriefs(store, { owner: async () => (await auth.currentSession())?.email ?? null })
  return { auth, briefs, contact: createLocalContact(), newsletter: createLocalNewsletter() }
}

/** The one place the pages get their backend. Network adapters replace the local ones here. */
export function createBackend(): Backend {
  return createLocalBackend(browserStore())
}
