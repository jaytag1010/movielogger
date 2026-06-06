import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { initApp } from './config'

const MAX_POSTER_BYTES = 5 * 1024 * 1024 // 5 MB
const UPLOAD_TIMEOUT_MS  = 30_000         // 30 s — cancel if storage hangs
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function storage() {
  return getStorage(initApp())
}

/** Storage path used for every manual poster (no extension — content-type in metadata). */
function posterRef(userId: string, entryId: string) {
  return ref(storage(), `posters/${userId}/${entryId}`)
}

/** Validate a file before upload; throws a user-friendly Error on failure. */
export function validatePosterFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP images are supported.')
  }
  if (file.size > MAX_POSTER_BYTES) {
    throw new Error('Poster must be under 5 MB.')
  }
}

/**
 * Upload a poster for an entry and return its public download URL.
 *
 * Uses uploadBytesResumable so the task can be cancelled.
 * A 30-second hard timeout cancels the task if Firebase Storage hangs
 * (e.g. mis-configured bucket, bad credentials, network stall) so the
 * caller always receives either a URL or a thrown Error — never a hang.
 */
export async function uploadPoster(
  userId: string,
  entryId: string,
  file: File
): Promise<string> {
  validatePosterFile(file)
  const r    = posterRef(userId, entryId)
  const task = uploadBytesResumable(r, file, { contentType: file.type })

  // Hard timeout — cancel the task if it hasn't completed within UPLOAD_TIMEOUT_MS.
  const timer = setTimeout(() => task.cancel(), UPLOAD_TIMEOUT_MS)

  try {
    // Wait for the upload task to complete (resolves to UploadTaskSnapshot).
    await task
    clearTimeout(timer)
    // Fetch and return the permanent download URL.
    return await getDownloadURL(r)
  } catch (err: unknown) {
    clearTimeout(timer)
    // Map the Firebase "canceled" code to a user-readable message.
    if ((err as { code?: string })?.code === 'storage/canceled') {
      throw new Error(
        'Poster upload timed out. Check your internet connection and Firebase Storage configuration.'
      )
    }
    throw err
  }
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
