// Profile photos: square-crop and shrink on the phone before uploading, so a
// 12 MB camera photo becomes a ~60 KB 512x512 JPEG.
import { supabase } from './supabase'

export const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

export async function squareJpeg(file, size = 512) {
  let bmp
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch {
    bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('That file isn’t a photo this phone can read. Try a JPG or PNG.')); img.src = URL.createObjectURL(file) })
  }
  const w = bmp.width, h = bmp.height, s = Math.min(w, h)
  const c = document.createElement('canvas'); c.width = size; c.height = size
  c.getContext('2d').drawImage(bmp, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size)
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not process the photo.'))), 'image/jpeg', 0.85))
}

// Upload a new photo for userId, save it on the profile, remove the old file.
export async function setAvatar(userId, file, oldUrl) {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new Error('Please choose a photo.')
  const blob = await squareJpeg(file)
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('Upload failed: ' + error.message)
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const { error: e2 } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId)
  if (e2) throw new Error('Could not save: ' + e2.message)
  await removeFile(oldUrl)
  return data.publicUrl
}

export async function clearAvatar(userId, oldUrl) {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
  if (error) throw new Error('Could not remove: ' + error.message)
  await removeFile(oldUrl)
}

async function removeFile(url) {
  const m = url && String(url).match(/\/avatars\/(.+)$/)
  if (m) await supabase.storage.from('avatars').remove([decodeURIComponent(m[1])]).catch(() => {})
}
