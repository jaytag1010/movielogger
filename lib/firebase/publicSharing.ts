import {
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
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
  isEntryPublic,
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

  if (currentUsername) await deletePublicProfileTree(currentUsername)

  const firestore = db()
  try {
    await runTransaction(firestore, async (transaction) => {
      const nextRef = doc(firestore, 'publicUsernames', username)
      const nextSnap = await transaction.get(nextRef)
      if (nextSnap.exists() && nextSnap.data().ownerUid !== userId) {
        throw new Error('That public username is already taken.')
      }
      transaction.set(nextRef, { ownerUid: userId, claimedAt: serverTimestamp() })
      transaction.set(doc(firestore, 'userProfiles', userId), { publicUsername: username }, { merge: true })
      if (currentUsername && currentUsername !== username) {
        transaction.delete(doc(firestore, 'publicUsernames', currentUsername))
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('taken')) throw error
    throw new Error('That public username is unavailable. Please choose another.')
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
    enabled: profile.publicProfileEnabled,
    showStats: profile.showPublicStats,
    stats,
    updatedAt: Timestamp.now(),
  }
}

export async function rebuildPublicLibrary(
  userId: string,
  sourceEntries: MediaEntry[],
  profileOverride?: UserProfile
): Promise<{ published: number; private: number }> {
  const profile = profileOverride ?? await getUserProfile(userId)
  if (!profile.publicUsername) return { published: 0, private: sourceEntries.length }
  const entries = await ensurePublicIds(sourceEntries)
  const visibility = normalizePublicVisibility(profile.publicVisibility)
  const publicEntries = entries.filter((entry) => isEntryPublic(entry, profile.publicProfileEnabled, visibility))
  const firestore = db()
  const titlesRef = collection(firestore, 'publicProfiles', profile.publicUsername, 'titles')
  const existing = await getDocs(titlesRef)
  const keep = new Set(publicEntries.map((entry) => entry.publicId!))

  const writes: Array<{ kind: 'set' | 'delete'; ref: ReturnType<typeof doc>; value?: PublicTitleDocument }> = []
  existing.docs.forEach((item) => {
    if (!keep.has(item.id)) writes.push({ kind: 'delete', ref: item.ref })
  })
  publicEntries.forEach((entry) => {
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

  await setDoc(
    doc(firestore, 'publicProfiles', profile.publicUsername),
    { ...publicProfilePayload(profile, calculatePublicStats(publicEntries)), updatedAt: serverTimestamp() },
    { merge: true }
  )
  return { published: publicEntries.length, private: entries.length - publicEntries.length }
}

export async function savePublicProfileSettings(
  userId: string,
  entries: MediaEntry[],
  settings: {
    publicProfileEnabled: boolean
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
  const preservedLists = previousUsername && normalizePublicUsername(previousUsername) !== normalizePublicUsername(settings.publicUsername)
    ? await getOwnerLists(userId, previousUsername, entries)
    : []
  const username = await claimPublicUsername(userId, settings.publicUsername, previousUsername)
  const profile: UserProfile = {
    ...settings,
    publicUsername: username,
    publicVisibility: normalizePublicVisibility(settings.publicVisibility),
    systemLists: currentProfile.systemLists ?? {},
  }
  await updateUserProfile(userId, profile)
  // Close the public read gate before rebuilding. This prevents stale titles
  // from being visible while stricter status/type settings are applied.
  await setDoc(doc(db(), 'publicProfiles', username), {
    username,
    enabled: false,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await rebuildPublicLibrary(userId, entries, profile)
  if (preservedLists.length > 0) {
    await Promise.all(preservedLists.map((list) => publishOwnerList(username, list, entries, profile)))
  }
  await Promise.all(SYSTEM_LISTS.map(async (definition) => {
    const config = getSystemListConfig(profile.systemLists, definition.type)
    if (config.visibility !== 'public') return
    const resolved = resolveSystemListEntries(definition.type, config, entries)
    const visibleIds = resolved
      .filter((entry) => isEntryPublic(entry, profile.publicProfileEnabled, profile.publicVisibility))
      .map((entry) => entry.publicId)
      .filter((id): id is string => !!id)
    await publishSystemList(username, {
      slug: definition.type,
      name: definition.name,
      description: definition.description,
      visibility: 'public',
      kind: 'system',
      systemType: definition.type,
      autoUpdate: config.autoUpdate,
      titleCount: visibleIds.length,
      titleIds: config.autoUpdate ? [] : visibleIds,
    })
  }))
  return profile
}

export async function syncPublicEntry(
  userId: string,
  entry: MediaEntry,
  allEntries: MediaEntry[]
): Promise<void> {
  const profile = await getUserProfile(userId)
  if (!profile.publicUsername) return
  const [ensuredEntry] = await ensurePublicIds([entry])
  const visibility = normalizePublicVisibility(profile.publicVisibility)
  const publicEntries = allEntries
    .map((item) => item.id === ensuredEntry.id ? ensuredEntry : item)
    .filter((item) => isEntryPublic(item, profile.publicProfileEnabled, visibility))
  const ref = doc(db(), 'publicProfiles', profile.publicUsername, 'titles', ensuredEntry.publicId!)
  if (isEntryPublic(ensuredEntry, profile.publicProfileEnabled, visibility)) {
    await setDoc(ref, toPublicTitle(ensuredEntry, ensuredEntry.publicId!))
  } else {
    await deleteDoc(ref).catch(() => {})
  }
  await setDoc(doc(db(), 'publicProfiles', profile.publicUsername), {
    ...publicProfilePayload(profile, calculatePublicStats(publicEntries)),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function removePublicEntry(
  userId: string,
  entry: MediaEntry,
  remainingEntries: MediaEntry[]
): Promise<void> {
  const profile = await getUserProfile(userId)
  if (!profile.publicUsername || !entry.publicId) return
  await deleteDoc(doc(db(), 'publicProfiles', profile.publicUsername, 'titles', entry.publicId)).catch(() => {})
  const visibility = normalizePublicVisibility(profile.publicVisibility)
  const publicEntries = remainingEntries.filter((item) => isEntryPublic(item, profile.publicProfileEnabled, visibility))
  await setDoc(doc(db(), 'publicProfiles', profile.publicUsername), {
    stats: calculatePublicStats(publicEntries),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  const lists = await getDocs(collection(db(), 'publicProfiles', profile.publicUsername, 'lists'))
  await Promise.all(lists.docs.map(async (list) => {
    const titleIds = (list.data().titleIds as string[] | undefined) ?? []
    if (titleIds.includes(entry.publicId!)) {
      await updateDoc(list.ref, { titleIds: titleIds.filter((id) => id !== entry.publicId), updatedAt: serverTimestamp() })
    }
  }))
}

export async function getPublicProfile(username: string): Promise<PublicProfileDocument | null> {
  const normalized = normalizePublicUsername(username)
  const snap = await getDoc(doc(db(), 'publicProfiles', normalized))
  return snap.exists() ? snap.data() as PublicProfileDocument : null
}

export interface PublicTitleQueryOptions {
  type?: 'all' | 'movie' | 'series' | 'shorts'
  status?: 'all' | 'completed' | 'watching' | 'planned' | 'on_hold' | 'dropped'
  search?: string
  pageSize?: number
  cursor?: QueryDocumentSnapshot | null
  sort?: 'newest' | 'title' | 'rating'
}

export async function getPublicTitles(
  username: string,
  options: PublicTitleQueryOptions = {}
): Promise<{ titles: PublicTitleDocument[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const pageSize = options.pageSize ?? 24
  const constraints: Parameters<typeof query>[1][] = []
  if (options.type && options.type !== 'all') constraints.push(where('type', '==', options.type))
  if (options.status && options.status !== 'all') constraints.push(where('status', '==', options.status))
  const search = options.search?.trim().toLocaleLowerCase()
  if (search) {
    constraints.push(where('titleLower', '>=', search), where('titleLower', '<=', `${search}\uf8ff`), orderBy('titleLower', 'asc'))
  } else if (options.sort === 'title') {
    constraints.push(orderBy('titleLower', 'asc'))
  } else if (options.sort === 'rating') {
    constraints.push(orderBy('personalRating', 'desc'))
  } else {
    constraints.push(orderBy('createdAt', 'desc'))
  }
  if (options.cursor) constraints.push(startAfter(options.cursor))
  constraints.push(limit(pageSize + 1))
  const snap = await getDocs(query(
    collection(db(), 'publicProfiles', normalizePublicUsername(username), 'titles'),
    ...constraints
  ))
  const visible = snap.docs.slice(0, pageSize)
  return {
    titles: visible.map((item) => item.data() as PublicTitleDocument),
    cursor: visible.at(-1) ?? null,
    hasMore: snap.docs.length > pageSize,
  }
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

async function publishOwnerList(
  username: string,
  list: OwnerListDocument,
  entries: MediaEntry[],
  profile: UserProfile
): Promise<void> {
  const normalized = normalizePublicVisibility(profile.publicVisibility)
  const byEntryId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]))
  const titleIds = list.entryIds
    .map((id) => byEntryId.get(id))
    .filter((entry): entry is MediaEntry => !!entry && isEntryPublic(entry, profile.publicProfileEnabled, normalized))
    .map((entry) => entry.publicId)
    .filter((id): id is string => !!id)
  await savePublicList(username, {
    slug: list.slug,
    name: list.name,
    description: list.description,
    visibility: list.visibility,
    kind: 'custom',
    systemType: null,
    autoUpdate: false,
    titleCount: titleIds.length,
    titleIds,
  })
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
  if (username) await publishOwnerList(username, payload, entries, profile)
  return payload
}

export async function deleteOwnerList(userId: string, username: string | null, slug: string): Promise<void> {
  await deleteDoc(doc(db(), 'userLists', userId, 'lists', slug))
  if (username) await deletePublicList(username, slug).catch(() => {})
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
  const results: PublicTitleDocument[] = []
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const snap = await getDocs(query(
      collection(db(), 'publicProfiles', normalizePublicUsername(username), 'titles'),
      where(documentId(), 'in', chunk)
    ))
    results.push(...snap.docs.map((item) => item.data() as PublicTitleDocument))
  }
  const byId = new Map(results.map((item) => [item.publicId, item]))
  return ids.map((id) => byId.get(id)).filter(Boolean) as PublicTitleDocument[]
}

export async function getAllPublicTitles(username: string): Promise<PublicTitleDocument[]> {
  const titles: PublicTitleDocument[] = []
  let cursor: QueryDocumentSnapshot | null = null
  do {
    const page = await getPublicTitles(username, { pageSize: 100, cursor, sort: 'newest' })
    titles.push(...page.titles)
    cursor = page.hasMore ? page.cursor : null
  } while (cursor)
  return titles
}
