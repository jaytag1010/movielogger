import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { initApp } from './config'
import type { MediaEntry } from '@/types/media'
import type {
  PublicListDocument,
  OwnerListDocument,
  PublicProfileDocument,
  PublicTitleDocument,
  PublicVisibilitySettings,
} from '@/types/public'
import { getUserProfile, updateUserProfile, UserProfile } from './firestore'
import {
  calculatePublicStats,
  normalizePublicVisibility,
  slugifyPublicList,
  toPublicTitle,
} from '@/utils/publicVisibility'
import { getSystemListConfig, resolveSystemListEntries, SYSTEM_LISTS } from '@/utils/systemLists'

const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'app', 'dashboard', 'login', 'logout', 'profile', 'settings',
  'signup', 'support', 'u', 'user', 'users', 'public', 'system', 'null', 'undefined',
])

function db() {
  return getFirestore(initApp())
}

export function normalizePublicUsername(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function validatePublicUsername(value: string): string | null {
  const normalized = normalizePublicUsername(value)
  if (normalized.length < 3 || normalized.length > 24) return 'Username must be 3–24 characters.'
  if (!/^[a-z0-9_]+$/.test(normalized)) return 'Use only letters, numbers, and underscores.'
  if (RESERVED_USERNAMES.has(normalized)) return 'This username is reserved.'
  return null
}

async function deletePublicProfileTree(username: string): Promise<void> {
  const firestore = db()
  for (const child of ['titles', 'lists']) {
    const snap = await getDocs(collection(firestore, 'publicProfiles', username, child))
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(firestore)
      snap.docs.slice(i, i + 400).forEach((item) => batch.delete(item.ref))
      await batch.commit()
    }
  }
  await deleteDoc(doc(firestore, 'publicProfiles', username)).catch(() => {})
}

export async function claimPublicUsername(
  userId: string,
  requestedUsername: string,
  currentUsername?: string | null
): Promise<string> {
  const username = normalizePublicUsername(requestedUsername)
  const validationError = validatePublicUsername(username)
  if (validationError) throw new Error(validationError)
  if (username === currentUsername) return username

  const firestore = db()
  try {
    await runTransaction(firestore, async (transaction) => {
      const nextRef = doc(firestore, 'publicUsernames', username)
      const nextSnap = await transaction.get(nextRef)
      if (nextSnap.exists() && nextSnap.data().ownerUid !== userId) {
        throw new Error('That public username is already taken.')
      }
      transaction.set(nextRef, { ownerUid: userId, claimedAt: serverTimestamp() })
      if (!currentUsername) {
        transaction.set(doc(firestore, 'userProfiles', userId), { publicUsername: username }, { merge: true })
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('taken')) throw error
    throw new Error('That public username is unavailable. Please choose another.')
  }
  if (currentUsername && currentUsername !== username) {
    // Keep ownership pointed at the old username until its public mirror has
    // been removed; Firestore rules use that ownership to authorize cleanup.
    await deletePublicProfileTree(currentUsername)
    await runTransaction(firestore, async (transaction) => {
      transaction.set(doc(firestore, 'userProfiles', userId), { publicUsername: username }, { merge: true })
      transaction.delete(doc(firestore, 'publicUsernames', currentUsername))
    })
  }
  return username
}

async function ensurePublicIds(entries: MediaEntry[]): Promise<MediaEntry[]> {
  const missing = entries.filter((entry) => entry.id && !entry.publicId)
  if (missing.length === 0) return entries
  const assigned = new Map<string, string>()
  const firestore = db()
  for (let i = 0; i < missing.length; i += 400) {
    const batch = writeBatch(firestore)
    missing.slice(i, i + 400).forEach((entry) => {
      const publicId = crypto.randomUUID()
      assigned.set(entry.id!, publicId)
      batch.update(doc(firestore, 'mediaEntries', entry.id!), { publicId })
    })
    await batch.commit()
  }
  return entries.map((entry) => entry.id && assigned.has(entry.id)
    ? { ...entry, publicId: assigned.get(entry.id)! }
    : entry)
}

function publicProfilePayload(profile: UserProfile, stats: ReturnType<typeof calculatePublicStats>): PublicProfileDocument {
  return {
    username: profile.publicUsername!,
    displayName: profile.displayName?.trim() || profile.publicUsername!,
    profilePhotoUrl: profile.profilePhotoUrl ?? null,
    bio: profile.bio?.trim() ?? '',
    // Kept for document compatibility. Profile identity is public by default
    // in Version 5.2; summary and folder visibility are independent controls.
    enabled: true,
    showStats: profile.showPublicStats,
    stats,
    updatedAt: Timestamp.now(),
  }
}

interface PublicFolderContext {
  entries: MediaEntry[]
  publicEntries: MediaEntry[]
  lists: PublicListDocument[]
}

async function buildPublicFolderContext(
  userId: string,
  sourceEntries: MediaEntry[],
  profile: UserProfile
): Promise<PublicFolderContext> {
  const entries = await ensurePublicIds(sourceEntries)
  const ownerLists = await getOwnerLists(userId, profile.publicUsername, entries)
  const byEntryId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]))
  const publicEntryIds = new Set<string>()
  const lists: PublicListDocument[] = []

  SYSTEM_LISTS.forEach((definition) => {
    const config = getSystemListConfig(profile.systemLists, definition.type)
    if (config.visibility !== 'public') return
    const resolved = resolveSystemListEntries(definition.type, config, entries)
    const titleIds = resolved.map((entry) => {
      if (entry.id) publicEntryIds.add(entry.id)
      return entry.publicId
    }).filter((id): id is string => !!id)
    lists.push({
      slug: definition.type,
      name: definition.name,
      description: definition.description,
      visibility: 'public',
      kind: 'system',
      systemType: definition.type,
      autoUpdate: config.autoUpdate,
      titleCount: titleIds.length,
      titleIds,
    })
  })

  ownerLists.filter((list) => list.visibility === 'public').forEach((list) => {
    const titleIds = list.entryIds.map((id) => {
      const entry = byEntryId.get(id)
      if (entry) publicEntryIds.add(id)
      return entry?.publicId
    }).filter((id): id is string => !!id)
    lists.push({
      slug: list.slug,
      name: list.name,
      description: list.description,
      visibility: 'public',
      kind: 'custom',
      systemType: null,
      autoUpdate: false,
      titleCount: titleIds.length,
      titleIds,
    })
  })

  return {
    entries,
    publicEntries: entries.filter((entry) => entry.id && publicEntryIds.has(entry.id)),
    lists,
  }
}

export async function rebuildPublicLibrary(
  userId: string,
  sourceEntries: MediaEntry[],
  profileOverride?: UserProfile,
  changedEntryId?: string,
  forceTitleRewrite = false
): Promise<{ published: number; private: number }> {
  const profile = profileOverride ?? await getUserProfile(userId)
  if (!profile.publicUsername) return { published: 0, private: sourceEntries.length }
  const { entries, publicEntries, lists } = await buildPublicFolderContext(userId, sourceEntries, profile)
  const firestore = db()
  const titlesRef = collection(firestore, 'publicProfiles', profile.publicUsername, 'titles')
  const existingLists = await getDocs(collection(firestore, 'publicProfiles', profile.publicUsername, 'lists'))
  const existingTitleDocs = changedEntryId ? null : await getDocs(titlesRef)
  const existingIds = existingTitleDocs
    ? new Set(existingTitleDocs.docs.map((item) => item.id))
    : new Set(existingLists.docs.flatMap((item) => (item.data().titleIds as string[] | undefined) ?? []))
  const keep = new Set(publicEntries.map((entry) => entry.publicId!))

  const writes: Array<{ kind: 'set' | 'delete'; ref: ReturnType<typeof doc>; value?: PublicTitleDocument }> = []
  existingIds.forEach((id) => {
    if (!keep.has(id)) writes.push({ kind: 'delete', ref: doc(titlesRef, id) })
  })
  publicEntries.forEach((entry) => {
    if (!forceTitleRewrite && existingIds.has(entry.publicId!) && entry.id !== changedEntryId) return
    writes.push({
      kind: 'set',
      ref: doc(firestore, 'publicProfiles', profile.publicUsername!, 'titles', entry.publicId!),
      value: toPublicTitle(entry, entry.publicId!),
    })
  })
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(firestore)
    writes.slice(i, i + 400).forEach((write) => {
      if (write.kind === 'delete') batch.delete(write.ref)
      else batch.set(write.ref, write.value!)
    })
    await batch.commit()
  }

  const keepLists = new Set(lists.map((list) => list.slug))
  for (const item of existingLists.docs) {
    if (!keepLists.has(item.id)) await deleteDoc(item.ref)
  }
  await Promise.all(lists.map((list) => savePublicList(profile.publicUsername!, list)))

  await setDoc(
    doc(firestore, 'publicProfiles', profile.publicUsername),
    { ...publicProfilePayload(profile, calculatePublicStats(entries)), updatedAt: serverTimestamp() },
    { merge: true }
  )
  return { published: publicEntries.length, private: entries.length - publicEntries.length }
}

export async function savePublicProfileSettings(
  userId: string,
  entries: MediaEntry[],
  settings: {
    publicUsername: string
    displayName: string | null
    profilePhotoUrl: string | null
    bio: string
    showPublicStats: boolean
    publicVisibility: PublicVisibilitySettings
  },
  previousUsername?: string | null
): Promise<UserProfile> {
  const currentProfile = await getUserProfile(userId)
  if (previousUsername && normalizePublicUsername(previousUsername) !== normalizePublicUsername(settings.publicUsername)) {
    await getOwnerLists(userId, previousUsername, entries)
  }
  const username = await claimPublicUsername(userId, settings.publicUsername, previousUsername)
  const profile: UserProfile = {
    ...settings,
    publicProfileEnabled: true,
    publicUsername: username,
    publicVisibility: normalizePublicVisibility(settings.publicVisibility),
    systemLists: currentProfile.systemLists ?? {},
    publicSharingVersion: 2,
  }
  await updateUserProfile(userId, profile)
  await rebuildPublicLibrary(userId, entries, profile, undefined, (currentProfile.publicSharingVersion ?? 1) < 2)
  return profile
}

/** One-time compatibility migration from the Version 5.1 master-toggle model. */
const sharingMigrations = new Map<string, Promise<void>>()

export function migratePublicSharingV2(userId: string, entries: MediaEntry[]): Promise<void> {
  const active = sharingMigrations.get(userId)
  if (active) return active
  const migration = (async () => {
    const profile = await getUserProfile(userId)
    if (!profile.publicUsername || (profile.publicSharingVersion ?? 1) >= 2) return
    const migrated: UserProfile = {
      ...profile,
      publicProfileEnabled: true,
      publicSharingVersion: 2,
    }
    await rebuildPublicLibrary(userId, entries, migrated, undefined, true)
    await updateUserProfile(userId, {
      publicProfileEnabled: true,
      publicSharingVersion: 2,
    })
  })().finally(() => sharingMigrations.delete(userId))
  sharingMigrations.set(userId, migration)
  return migration
}

export async function syncPublicEntry(
  userId: string,
  entry: MediaEntry,
  allEntries: MediaEntry[]
): Promise<void> {
  const profile = await getUserProfile(userId)
  if (!profile.publicUsername) return
  const merged = allEntries.map((item) => item.id === entry.id ? entry : item)
  await rebuildPublicLibrary(userId, merged, profile, entry.id)
}

export async function removePublicEntry(
  userId: string,
  entry: MediaEntry,
  remainingEntries: MediaEntry[]
): Promise<void> {
  const profile = await getUserProfile(userId)
  const ownerLists = await getOwnerLists(userId, profile.publicUsername, remainingEntries)
  await Promise.all(ownerLists.filter((list) => list.entryIds.includes(entry.id!)).map((list) => (
    updateDoc(doc(db(), 'userLists', userId, 'lists', list.slug), {
      entryIds: list.entryIds.filter((id) => id !== entry.id),
      updatedAt: serverTimestamp(),
    })
  )))
  if (profile.publicUsername) await rebuildPublicLibrary(userId, remainingEntries, profile)
}

export async function getPublicProfile(username: string): Promise<PublicProfileDocument | null> {
  const normalized = normalizePublicUsername(username)
  const snap = await getDoc(doc(db(), 'publicProfiles', normalized))
  return snap.exists() ? snap.data() as PublicProfileDocument : null
}

export async function getPublicLists(username: string): Promise<PublicListDocument[]> {
  const snap = await getDocs(query(
    collection(db(), 'publicProfiles', normalizePublicUsername(username), 'lists'),
    where('visibility', '==', 'public'),
    orderBy('updatedAt', 'desc')
  ))
  return snap.docs.map((item) => item.data() as PublicListDocument)
}

export async function getOwnerLists(userId: string, legacyUsername?: string | null, entries: MediaEntry[] = []): Promise<OwnerListDocument[]> {
  const ownerRef = collection(db(), 'userLists', userId, 'lists')
  const snap = await getDocs(ownerRef)
  if (!snap.empty) return snap.docs.map((item) => item.data() as OwnerListDocument)

  // One-time compatibility bridge for lists created in Version 5.0.
  if (!legacyUsername) return []
  const legacy = await getDocs(collection(db(), 'publicProfiles', normalizePublicUsername(legacyUsername), 'lists'))
  const entryIdByPublicId = new Map(entries.filter((entry) => entry.id && entry.publicId).map((entry) => [entry.publicId!, entry.id!]))
  const migrated: OwnerListDocument[] = legacy.docs
    .map((item) => item.data() as PublicListDocument)
    .filter((item) => (item.kind ?? 'custom') === 'custom')
    .map((item) => ({ ...item, ownerUid: userId, entryIds: item.titleIds.map((id) => entryIdByPublicId.get(id)).filter((id): id is string => !!id) }))
  await Promise.all(migrated.map((item) => setDoc(doc(ownerRef, item.slug), item)))
  return migrated
}

export async function saveOwnerList(
  userId: string,
  username: string | null,
  input: Omit<OwnerListDocument, 'ownerUid' | 'slug' | 'createdAt' | 'updatedAt'> & { slug?: string },
  entries: MediaEntry[],
  profile: UserProfile
): Promise<OwnerListDocument> {
  const slug = input.slug || slugifyPublicList(input.name)
  if (!slug) throw new Error('Enter a valid list name.')
  const ref = doc(db(), 'userLists', userId, 'lists', slug)
  const existing = await getDoc(ref)
  const payload: OwnerListDocument = {
    ...input,
    slug,
    ownerUid: userId,
    titleIds: [],
    createdAt: existing.exists() ? (existing.data().createdAt ?? Timestamp.now()) : Timestamp.now(),
    updatedAt: Timestamp.now(),
  }
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp(), ...(existing.exists() ? {} : { createdAt: serverTimestamp() }) })
  if (username) await rebuildPublicLibrary(userId, entries, profile)
  return payload
}

export async function deleteOwnerList(userId: string, username: string | null, slug: string, entries: MediaEntry[] = [], profile?: UserProfile): Promise<void> {
  await deleteDoc(doc(db(), 'userLists', userId, 'lists', slug))
  if (username) await rebuildPublicLibrary(userId, entries, profile)
}

export async function publishSystemList(
  username: string,
  list: Omit<PublicListDocument, 'createdAt' | 'updatedAt'>
): Promise<void> {
  await savePublicList(username, list)
}

export async function savePublicList(
  username: string,
  input: Omit<PublicListDocument, 'slug' | 'createdAt' | 'updatedAt'> & { slug?: string }
): Promise<PublicListDocument> {
  const slug = input.slug || slugifyPublicList(input.name)
  if (!slug) throw new Error('Enter a valid list name.')
  const ref = doc(db(), 'publicProfiles', normalizePublicUsername(username), 'lists', slug)
  const existing = await getDoc(ref)
  const payload: PublicListDocument = {
    ...input,
    slug,
    createdAt: existing.exists() ? (existing.data().createdAt ?? Timestamp.now()) : Timestamp.now(),
    updatedAt: Timestamp.now(),
  }
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp(), ...(existing.exists() ? {} : { createdAt: serverTimestamp() }) })
  return payload
}

export async function deletePublicList(username: string, slug: string): Promise<void> {
  await deleteDoc(doc(db(), 'publicProfiles', normalizePublicUsername(username), 'lists', slug))
}

export async function getPublicList(username: string, slug: string): Promise<PublicListDocument | null> {
  const snap = await getDoc(doc(db(), 'publicProfiles', normalizePublicUsername(username), 'lists', slug))
  return snap.exists() ? snap.data() as PublicListDocument : null
}

export async function getPublicTitlesByIds(username: string, ids: string[]): Promise<PublicTitleDocument[]> {
  if (ids.length === 0) return []
  const byId = new Map<string, PublicTitleDocument>()
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25)
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const snap = await getDoc(doc(db(), 'publicProfiles', normalizePublicUsername(username), 'titles', id))
        return snap.exists() ? snap.data() as PublicTitleDocument : null
      } catch {
        // Legacy documents without the public-folder marker are intentionally
        // denied by Firestore until the owner's one-time migration runs.
        return null
      }
    }))
    results.forEach((title) => { if (title) byId.set(title.publicId, title) })
  }
  return ids.map((id) => byId.get(id)).filter(Boolean) as PublicTitleDocument[]
}
