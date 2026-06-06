'use client'

import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  StorageError,
} from 'firebase/storage'
import { initApp } from './config'

const MAX_POSTER_BYTES  = 5 * 1024 * 1024  // 5 MB
const UPLOAD_TIMEOUT_MS = 30_000            // 30 s hard limit
const ALLOWED_TYPES     = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

// ── Internal helpers ──────────────────────────────────────────────────────

function storage() {
  return getStorage(initApp())
}

function posterRef(userId: string, entryId: string) {
  return ref(storage(), `posters/${userId}/${entryId}`)
}

/** Stringify a Firebase StorageError for display and logging. */
function describeStorageError(err: StorageError): string {
  return `[${err.code}] ${err.message}${err.serverResponse ? ` — server: ${err.serverResponse}` : ''}`
}

// ── Public API ────────────────────────────────────────────────────────────

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
 * Upload a poster to Firebase Storage and return its download URL.
 *
 * IMPORTANT — WHY we use task.on() instead of `await task`:
 *   Firebase UploadTask implements a custom PromiseLike (not a real Promise).
 *   In Next.js 14's webpack build with custom conditionNames the internal
 *   _promise callbacks are never fired, so `await task` hangs indefinitely
 *   even after the upload finishes or is cancelled.  Using the event listener
 *   API (task.on) bypasses that layer entirely and is always reliable.
 *
 * A 30-second hard timeout cancels the task so the caller always gets either
 * a URL or a thrown Error — never an indefinite hang.
 */
export function uploadPoster(
  userId: string,
  entryId: string,
  file: File
): Promise<string> {
  validatePosterFile(file)

  // ── Pre-flight: verify storage bucket is configured ──────────────────
  const app    = initApp()
  const bucket = app.options.storageBucket
  if (!bucket) {
    const msg = 'Firebase Storage is not configured — NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is missing.'
    console.error('[Poster]', msg)
    return Promise.reject(new Error(msg))
  }

  console.log('[Poster] Starting upload', {
    bucket,
    userId,
    entryId,
    fileName: file.name,
    sizeKB:   (file.size / 1024).toFixed(1),
    type:     file.type,
  })

  const r = posterRef(userId, entryId)
  console.log('[Poster] Storage ref →', r.fullPath)

  const task = uploadBytesResumable(r, file, { contentType: file.type })
  console.log('[Poster] UploadTask created, initial state:', task.snapshot.state)

  // ── Wrap in a real Promise so async/await works reliably ─────────────
  return new Promise<string>((resolve, reject) => {

    // Hard timeout — cancel the task if nothing completes in time.
    const timer = setTimeout(() => {
      console.warn('[Poster] Hard timeout reached after', UPLOAD_TIMEOUT_MS, 'ms — cancelling task')
      task.cancel()
    }, UPLOAD_TIMEOUT_MS)

    function done() { clearTimeout(timer) }

    task.on(
      'state_changed',

      // ── Progress ───────────────────────────────────────────────────
      (snapshot) => {
        const pct = snapshot.totalBytes > 0
          ? ((snapshot.bytesTransferred / snapshot.totalBytes) * 100).toFixed(1)
          : '—'
        console.log('[Poster] Progress:', {
          state:            snapshot.state,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes:       snapshot.totalBytes,
          pct:              pct + '%',
        })
      },

      // ── Error ──────────────────────────────────────────────────────
      (error: StorageError) => {
        done()
        console.error('[Poster] Upload error:', describeStorageError(error))

        if (error.code === 'storage/canceled') {
          // Task was cancelled — most likely by our timeout above.
          reject(new Error(
            `Poster upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s. ` +
            'Firebase Storage may not be enabled or the security rules may be blocking writes. ' +
            'Check the browser console Network tab for the actual HTTP response.'
          ))
        } else {
          // Expose the real Firebase error so it's visible in the toast.
          reject(new Error(`Firebase Storage upload failed — ${describeStorageError(error)}`))
        }
      },

      // ── Complete ───────────────────────────────────────────────────
      async () => {
        done()
        console.log('[Poster] Upload complete — fetching download URL')
        try {
          const url = await getDownloadURL(r)
          console.log('[Poster] Download URL obtained ✓', url.slice(0, 80) + '…')
          resolve(url)
        } catch (urlErr: unknown) {
          const msg = urlErr instanceof StorageError
            ? describeStorageError(urlErr)
            : String(urlErr)
          console.error('[Poster] getDownloadURL failed:', msg)
          reject(new Error(`Firebase Storage: could not retrieve download URL — ${msg}`))
        }
      }
    )
  })
}

/** Delete the manual poster for an entry (no-op if none exists). */
export async function deletePoster(
  userId: string,
  entryId: string
): Promise<void> {
  try {
    await deleteObject(posterRef(userId, entryId))
    console.log('[Poster] Deleted poster for entry', entryId)
  } catch {
    // Object may not exist — treat as success.
  }
}
