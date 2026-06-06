/**
 * ImgBB poster upload utility.
 *
 * Follows the same AbortController + timeout pattern used in lib/tmdb/api.ts.
 * No Firebase Storage dependency — works on the Firebase Spark (free) plan.
 *
 * Environment variable required:
 *   NEXT_PUBLIC_IMGBB_API_KEY
 */

const IMGBB_ENDPOINT    = 'https://api.imgbb.com/1/upload'
const UPLOAD_TIMEOUT_MS = 30_000           // 30 s — same ceiling as TMDB calls
const MAX_POSTER_BYTES  = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES     = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

// ── Helpers ───────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_IMGBB_API_KEY
  if (!key) {
    throw new Error(
      'ImgBB is not configured. Add NEXT_PUBLIC_IMGBB_API_KEY to your .env.local file.'
    )
  }
  return key
}

/** Convert a File to a raw base64 string (no data-URI prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // FileReader produces "data:image/jpeg;base64,<data>" — ImgBB wants only <data>.
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('Failed to convert image to base64.'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

interface ImgbbResponse {
  data?: {
    url:         string
    display_url: string
    delete_url:  string
  }
  success: boolean
  status:  number
  error?: { message: string }
}

// ── Public API ────────────────────────────────────────────────────────────

/** Validate a poster file before upload. Throws a user-readable Error on failure. */
export function validatePosterFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP images are supported.')
  }
  if (file.size > MAX_POSTER_BYTES) {
    throw new Error('Poster must be under 5 MB.')
  }
}

/**
 * Upload a poster image to ImgBB and return the hosted URL.
 *
 * The image is converted to base64 client-side, then POSTed to the ImgBB API.
 * An AbortController enforces a 30-second timeout (matching TMDB fetch calls).
 * The returned URL is stored in Firestore as `manualPosterUrl`.
 */
export async function uploadPoster(file: File): Promise<string> {
  validatePosterFile(file)

  const key = getApiKey()
  console.log('[ImgBB] Converting to base64…', {
    name:   file.name,
    sizeKB: (file.size / 1024).toFixed(1),
    type:   file.type,
  })

  const base64 = await fileToBase64(file)
  console.log('[ImgBB] Base64 ready — uploading…')

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
    console.warn('[ImgBB] Timeout — upload aborted after', UPLOAD_TIMEOUT_MS, 'ms')
  }, UPLOAD_TIMEOUT_MS)

  const body = new FormData()
  body.append('image', base64)
  body.append('name',  `poster_${Date.now()}`)

  try {
    const res = await fetch(`${IMGBB_ENDPOINT}?key=${key}`, {
      method: 'POST',
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    console.log('[ImgBB] HTTP response:', res.status, res.statusText)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`ImgBB upload failed (HTTP ${res.status})${text ? ': ' + text : ''}`)
    }

    const json = (await res.json()) as ImgbbResponse

    if (!json.success || !json.data?.url) {
      throw new Error(
        `ImgBB upload failed: ${json.error?.message ?? JSON.stringify(json)}`
      )
    }

    console.log('[ImgBB] Upload succeeded ✓', json.data.url.slice(0, 70) + '…')
    return json.data.url

  } catch (err: unknown) {
    clearTimeout(timer)
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error(
        'Poster upload timed out after 30 s. Check your internet connection and try again.'
      )
    }
    throw err
  }
}

/**
 * ImgBB free tier does not expose a deletion API.
 * Removing a poster from an entry sets `manualPosterUrl` to null in Firestore;
 * the image remains on ImgBB's CDN (expected behaviour for the free plan).
 */
export async function deletePoster(): Promise<void> {
  // Intentional no-op.
}
