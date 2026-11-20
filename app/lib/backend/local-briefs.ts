import type { Brief } from '../account.ts'
import { fromStored, isSelection, sameSelection, type StoredSelection } from '../estimate.ts'
import { readJson, writeJson, type KeyValueStore } from './storage.ts'
import { MAX_BRIEFS, type BriefsBackend } from './types.ts'

// The Privacy and Cookie pages list this key; a test reads it from here.
export const BRIEFS_KEY = 'marque.briefs'

/** `owner` is the lower-cased address that saved it; null (or missing, in older records) when saved signed out. */
type StoredBrief = Omit<Brief, 'selection'> & { selection: StoredSelection; owner?: string | null }
type Kept = { brief: Brief; owner: string | null }

/** A four-digit year from 1970 on, so the date line can always show the day it was saved. */
function savedAtOk(text: string): boolean {
  const year = Number(/^(\d{4})-\d\d-\d\dT/.exec(text)?.[1])
  return year >= 1970 && !Number.isNaN(Date.parse(text))
}

function isBrief(value: unknown): value is StoredBrief {
  const v = value as StoredBrief | null
  const owner: unknown = v?.owner
  return (
    !!v &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.savedAt === 'string' &&
    savedAtOk(v.savedAt) &&
    (owner === undefined || owner === null || typeof owner === 'string') &&
    isSelection(v.selection)
  )
}

function readAll(store: KeyValueStore | null): Kept[] {
  const value = readJson(store, BRIEFS_KEY)
  const all: Kept[] = Array.isArray(value)
    ? value.filter(isBrief).map((b) => ({ brief: { id: b.id, savedAt: b.savedAt, selection: fromStored(b.selection) }, owner: b.owner ?? null }))
    : []
  return all.sort((a, b) => b.brief.savedAt.localeCompare(a.brief.savedAt))
}

function writeAll(store: KeyValueStore | null, all: readonly Kept[]): boolean {
  return writeJson(store, BRIEFS_KEY, all.map(({ brief, owner }) => ({ ...brief, owner })))
}

const ownerKey = (email: string | null) => (email === null ? null : email.toLowerCase())

/** Gives the briefs saved signed out to the address that just signed in. False when the browser kept nothing. */
export function claimBriefs(store: KeyValueStore | null, email: string): boolean {
  const all = readAll(store)
  if (!all.some((k) => k.owner === null)) return true
  return writeAll(store, all.map((k) => (k.owner === null ? { ...k, owner: ownerKey(email) } : k)))
}

/** Briefs kept in this browser under BRIEFS_KEY, each under its owner's address. `owner` gives the signed-in address; `now` is for tests. */
export function createLocalBriefs(store: KeyValueStore | null, options: { owner?: () => Promise<string | null>; now?: () => Date } = {}): BriefsBackend {
  const now = options.now ?? (() => new Date())
  const owner = options.owner ?? (async () => null)

  /** All the kept briefs, split into the ones the signed-in person can see (newest first) and everyone else's. */
  const split = async () => {
    const key = ownerKey(await owner())
    const all = readAll(store)
    const seen = (k: Kept) => k.owner === null || k.owner === key
    return { key, mine: all.filter(seen), others: all.filter((k) => !seen(k)) }
  }

  return {
    async list() {
      return (await split()).mine.slice(0, MAX_BRIEFS).map((k) => k.brief)
    },

    async save(selection) {
      if (!store) return { status: 'not-saved' }
      const { key, mine, others } = await split()
      if (mine[0] && sameSelection(mine[0].brief.selection, selection)) return { status: 'already-saved', brief: mine[0].brief }
      const at = now()
      const brief: Brief = { id: `b${at.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, savedAt: at.toISOString(), selection }
      const all = [{ brief, owner: key }, ...mine]
      const kept = all.slice(0, MAX_BRIEFS)
      return writeAll(store, [...kept, ...others]) ? { status: 'saved', brief, dropped: all.length - kept.length } : { status: 'not-saved' }
    },

    async remove(id) {
      const { mine, others } = await split()
      if (!mine.some((k) => k.brief.id === id)) return { status: 'not-found' }
      return writeAll(store, [...mine.filter((k) => k.brief.id !== id), ...others]) ? { status: 'removed' } : { status: 'not-removed' }
    },
  }
}
