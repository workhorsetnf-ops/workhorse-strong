// in-memory supabase-js stand-in for server tests
export function makeSb(tables = {}) {
  const db = tables
  const q = (table) => {
    const filters = []; let mode = 'select', payload = null, opts = {}, single = false, limitN = null
    const rows = () => (db[table] ||= [])
    const match = r => filters.every(f => f(r))
    const run = () => {
      if (mode === 'update') { const hit = rows().filter(match); hit.forEach(r => Object.assign(r, payload)); return { data: hit, error: null } }
      if (mode === 'delete') { const keep = rows().filter(r => !match(r)); const n = rows().length - keep.length; db[table] = keep; return { data: n, error: null } }
      if (mode === 'upsert') {
        const keys = (opts.onConflict || 'id').split(',')
        for (const p of [].concat(payload)) {
          const ex = rows().find(r => keys.every(k => r[k] === p[k]))
          if (ex) { if (!opts.ignoreDuplicates) Object.assign(ex, p) } else rows().push({ id: p.id || `id${Math.random().toString(36).slice(2, 8)}`, ...p })
        }
        return { data: null, error: null }
      }
      if (mode === 'insert') { for (const p of [].concat(payload)) rows().push({ id: p.id || `id${Math.random().toString(36).slice(2, 8)}`, ...p }); return { data: payload, error: null } }
      let out = rows().filter(match); if (limitN) out = out.slice(0, limitN)
      return { data: single ? (out[0] || null) : out, error: null }
    }
    const api = {
      select() { return api }, order() { return api }, limit(n) { limitN = n; return api },
      eq(c, v) { filters.push(r => r[c] === v); return api }, neq(c, v) { filters.push(r => r[c] !== v); return api },
      in(c, vs) { filters.push(r => vs.includes(r[c])); return api }, is(c, v) { filters.push(r => (r[c] ?? null) === v); return api },
      update(p) { mode = 'update'; payload = p; return api }, delete() { mode = 'delete'; return api },
      upsert(p, o = {}) { mode = 'upsert'; payload = p; opts = o; return api }, insert(p) { mode = 'insert'; payload = p; return api },
      maybeSingle() { single = true; return Promise.resolve(run()) }, single() { single = true; return Promise.resolve(run()) },
      then(a, b) { return Promise.resolve(run()).then(a, b) },
    }
    return api
  }
  return { from: q, db }
}
export const res = () => { const r = { code: 200 }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r }
