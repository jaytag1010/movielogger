const ALLOWED_PROFILE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const OUTPUT_SIZE = 384
const MAX_STORED_CHARACTERS = 600_000

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('The selected image could not be decoded.'))
    }
    image.src = objectUrl
  })
}

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The profile image could not be compressed.'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('The compressed profile image could not be read.'))
      reader.readAsDataURL(blob)
    }, 'image/webp', 0.82)
  })
}

/**
 * Produces a small square avatar suitable for storage in the existing
 * Firestore profilePhotoUrl field. The bounded output avoids external CDN
 * availability and cache issues without changing the profile data model.
 */
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!ALLOWED_PROFILE_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP profile images are supported.')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Profile photo must be under 15 MB.')
  }

  const image = await loadImage(file)
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  if (!sourceSize) throw new Error('The selected image has invalid dimensions.')

  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2)
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Profile image processing is unavailable in this browser.')

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  )

  const dataUrl = await canvasToDataUrl(canvas)
  if (dataUrl.length > MAX_STORED_CHARACTERS) {
    throw new Error('The processed profile image is still too large. Please choose a simpler image.')
  }
  return dataUrl
}
