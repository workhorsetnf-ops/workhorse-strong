// Photos, GIFs, short videos and voice notes for the Community.
// Everything goes to the private community-media bucket under the poster's
// own folder; the feed shows them through short-lived signed links.

export const COMMUNITY_BUCKET = 'community-media'
export const MAX_IMAGES = 4
export const MAX_VIDEO_SECONDS = 60
export const MAX_BYTES = 50 * 1024 * 1024   // matches the bucket's limit
const MAX_IMAGE_EDGE = 1600                  // phone photos are shrunk to this before upload

export function mediaKind(file) {
  const t = String(file?.type || '')
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  return null
}

// What can go on one post: up to 4 photos/GIFs, OR one video, OR one voice
// note. Returns an error message, or '' if the new files fit.
export function checkAttachments(current, incoming) {
  const all = [...current, ...incoming.map(f => ({ kind: mediaKind(f), size: f.size, name: f.name }))]
  if (all.some(a => !a.kind)) return 'Only photos, GIFs, videos and voice notes can be posted.'
  const big = all.find(a => a.size > MAX_BYTES)
  if (big) return `${big.name || 'That file'} is over 50 MB.`
  const kinds = new Set(all.map(a => a.kind))
  if (kinds.size > 1) return 'A post can have photos, or one video, or one voice note — not a mix.'
  const k = [...kinds][0]
  if (k === 'image' && all.length > MAX_IMAGES) return `Up to ${MAX_IMAGES} photos per post.`
  if ((k === 'video' || k === 'audio') && all.length > 1) return `One ${k === 'video' ? 'video' : 'voice note'} per post.`
  return ''
}

// Where a file is stored: <user id>/<time>-<random>.<ext>
export function mediaPath(userId, file, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)) {
  const fromName = String(file?.name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1]
  const fromType = String(file?.type || '').split('/')[1]?.split(/[;+]/)[0]
  const ext = (fromName || fromType || 'bin').toLowerCase()
  return `${userId}/${now}-${rand}.${ext}`
}

// Shrink big photos so posts load fast on a phone. GIFs are left alone so
// they keep animating; anything small enough already is left alone too.
export async function prepareImage(file) {
  if (file.type === 'image/gif' || file.size < 400 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 2 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file   // e.g. HEIC the browser can't decode — upload as-is
  }
}

export function videoSeconds(file) {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    const url = URL.createObjectURL(file)
    const done = s => { URL.revokeObjectURL(url); resolve(s) }
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0)
    v.onerror = () => done(0)
    v.src = url
  })
}
