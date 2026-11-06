// Bulk icon upload: match image file names to Library exercises (Update 176).
import { smartScore, confidence, baseKey } from './exmatch'

// "Barbell_Back-Squat (1).png" -> "Barbell Back Squat"
export function cleanFileName(name) {
  return String(name || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_\-+.]+/g, ' ')
    .replace(/\(\s*\d+\s*\)|\bcopy\b|\b(icon|thumbnail|thumb|final|v\d+)\b/gi, ' ')
    .replace(/\s+\d{1,2}$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
// ChatGPT's own download names say nothing about the exercise
export const isGenericName = n => /^(chatgpt image|dall ?e|image|img|screenshot|photo|untitled)\b/i.test(cleanFileName(n)) || !/[a-z]{3}/i.test(cleanFileName(n))

// files: [{ name }], library: [{ id, name, icon_url }]
// -> [{ libId|null, score, conf }] one per file; an exercise goes to its best file only
export function matchFiles(files, library) {
  const out = files.map(f => {
    if (isGenericName(f.name)) return { libId: null, score: 0, conf: 'none' }
    const n = cleanFileName(f.name), k = baseKey(n)
    let best = null, score = 0
    for (const l of library) {
      const s = baseKey(l.name) === k ? 1 : smartScore(n, l.name)
      if (s > score) { score = s; best = l }
    }
    return score >= 0.4 ? { libId: best.id, score, conf: score >= 0.6 ? confidence(score) : 'check' } : { libId: null, score, conf: 'none' }
  })
  // two files claiming one exercise: the better match keeps it
  const owner = {}
  out.forEach((m, i) => { if (m.libId && (owner[m.libId] == null || out[owner[m.libId]].score < m.score)) owner[m.libId] = i })
  return out.map((m, i) => (m.libId && owner[m.libId] !== i ? { libId: null, score: m.score, conf: 'none' } : m))
}

// Generic-named files (ChatGPT downloads) in the order they were saved, onto
// exercises without an icon in the order of the copied list.
export function matchByOrder(files, matches, missing) {
  const taken = new Set(matches.map(m => m.libId).filter(Boolean))
  const queue = missing.filter(l => !taken.has(l.id))
  const order = files.map((f, i) => i).filter(i => !matches[i].libId).sort((a, b) => (files[a].lastModified || 0) - (files[b].lastModified || 0))
  const next = matches.map(m => ({ ...m }))
  order.forEach((i, k) => { if (queue[k]) next[i] = { libId: queue[k].id, score: 0, conf: 'order' } })
  return next
}

// Library exercises with no icon, A-Z (the list to give ChatGPT)
export const missingIcons = library => library.filter(l => !l.icon_url).sort((a, b) => a.name.localeCompare(b.name))

// Shrink to a 256px square-ish webp so icons load fast in the app.
export async function shrinkImage(file, max = 256) {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9))
    return blob && blob.size < file.size ? { blob, ext: 'webp', type: 'image/webp' } : { blob: file, ext: (file.name.split('.').pop() || 'png').toLowerCase(), type: file.type }
  } catch { return { blob: file, ext: (file.name.split('.').pop() || 'png').toLowerCase(), type: file.type } }
}
