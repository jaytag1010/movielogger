import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { initApp } from './config'

const MAX_POSTER_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function storage() {
  return getStorage(initApp())
}

/** Storage path used for every manual poster (no extension — content-type is in metadata). */
function posterRef(userId: string, entryId: string) {
  return ref(storage(), `posters/${userId}/${entryId}`)
}

/** Validate a file before upload; throws with a user-friendly message on failure. */
export function validatePosterFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP images are supported.')
  }
  if (file.size > MAX_POSTER_BYTES) {
    throw new Error('Poster must be under 5 MB.')
  }
}

/** Upload a poster for an entry and return its public download URL. */
export async function uploadPoster(
  userId: string,
  entryId: string,
  file: File
): Promise<string> {
  validatePosterFile(file)
  const r = posterRef(userId, entryId)
  await uploadBytes(r, file, { contentType: file.type })
  return getDownloadURL(r)
}

/** Delete the manual poster for an entry (no-op if none exists). */
export async function deletePoster(
  userId: string,
  entryId: string
): Promise<void> {
  try {
    await deleteObject(posterRef(userId, entryId))
  } catch {
    // Object may not exist — treat as success.
  }
}
