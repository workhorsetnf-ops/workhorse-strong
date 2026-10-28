import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import VoiceRecorder from '../lib/VoiceRecorder'
import Avatar from './Avatar'
import { COMMUNITY_BUCKET, MAX_VIDEO_SECONDS, checkAttachments, mediaKind, mediaPath, prepareImage, videoSeconds } from '../lib/media'

// Shared community feed — used by both client and coach views.
// isCoach controls moderation (delete any post/comment) and posting polls.
// Posts can carry up to 4 photos/GIFs, or one short video, or one voice note.

// Percent of votes for each option, rounded, plus the total.
export function pollTally(options, votes) {
  const total = votes.length
  return {
    total,
    rows: options.map(o => {
      const n = votes.filter(v => v.option_id === o.id).length
      return { ...o, n, pct: total ? Math.round((n / total) * 100) : 0 }
    }),
  }
}

// Paths of every file the feed needs a link for.
export function mediaPaths(items) {
  return [...new Set(items.flatMap(x => (Array.isArray(x.media) ? x.media : []).map(m => m.path).filter(Boolean)))]
}

const iconBtn = { padding: '7px 10px', fontSize: 13, cursor: 'pointer' }

function MediaView({ media, urls, compact = false }) {
  if (!media?.length) return null
  const kind = media[0].kind
  if (kind === 'audio') {
    const u = urls[media[0].path]
    return u ? <audio src={u} controls preload="none" style={{ width: '100%', maxWidth: 320, height: 36, marginTop: 6 }} /> : <span className="muted" style={{ fontSize: 12 }}>🎙 Voice note</span>
  }
  if (kind === 'video') {
    const u = urls[media[0].path]
    return u ? <video src={u} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 420, borderRadius: 10, marginTop: 8, background: '#000' }} /> : null
  }
  const cols = media.length === 1 ? 1 : 2
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4, marginTop: 8, borderRadius: 10, overflow: 'hidden', maxWidth: compact ? 260 : undefined }}>
      {media.map(m => urls[m.path] && (
        <a key={m.path} href={urls[m.path]} target="_blank" rel="noreferrer" style={{ display: 'block', background: 'var(--steel)' }}>
          <img src={urls[m.path]} alt="" loading="lazy"
            style={{ width: '100%', display: 'block', objectFit: 'cover', aspectRatio: media.length === 1 ? undefined : '1 / 1', maxHeight: media.length === 1 ? 480 : undefined }} />
        </a>
      ))}
    </div>
  )
}

function Poll({ post, options, votes, me, isCoach, names, onVote, onToggleClosed }) {
  const { total, rows } = pollTally(options, votes)
  const mine = votes.find(v => v.voter_id === me)?.option_id
  const showResults = !!mine || post.poll_closed || isCoach
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      {rows.map(o => {
        const picked = mine === o.id
        const voters = isCoach ? votes.filter(v => v.option_id === o.id).map(v => (names[v.voter_id]?.full_name || 'Member').split(' ')[0]) : []
        return (
          <button key={o.id} disabled={post.poll_closed} onClick={() => onVote(o.id)}
            style={{ position: 'relative', textAlign: 'left', padding: '10px 12px', borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${picked ? 'var(--orange)' : 'var(--line)'}`, background: 'var(--steel)', color: 'inherit', cursor: post.poll_closed ? 'default' : 'pointer' }}>
            {showResults && <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${o.pct}%`, background: picked ? 'rgba(255,106,0,0.28)' : 'rgba(255,255,255,0.07)', transition: 'width .3s' }} />}
            <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, fontWeight: picked ? 800 : 600 }}>
              <span>{picked ? '✓ ' : ''}{o.label}</span>
              {showResults && <span>{o.pct}%</span>}
            </span>
            {voters.length > 0 && <span className="muted" style={{ position: 'relative', display: 'block', fontSize: 11, marginTop: 2 }}>{voters.join(', ')}</span>}
          </button>
        )
      })}
      <div className="muted" style={{ fontSize: 11.5, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span>{total} vote{total === 1 ? '' : 's'}{post.poll_closed ? ' · Closed' : mine ? ' · Tap another to change' : ''}</span>
        {isCoach && <button onClick={onToggleClosed} style={{ background: 'none', color: 'var(--orange-hot)', fontSize: 11.5, fontWeight: 700, padding: 0 }}>{post.poll_closed ? 'Reopen poll' : 'Close poll'}</button>}
      </div>
    </div>
  )
}

export default function ClientCommunity({ isCoach = false }) {
  const { profile } = useAuth()
  const [posts, setPosts] = useState([])
  const [names, setNames] = useState({})          // id -> { full_name, avatar_url, role }
  const [body, setBody] = useState('')
  const [open, setOpen] = useState(null)
  const [comments, setComments] = useState({})
  const [reply, setReply] = useState('')
  const [likes, setLikes] = useState({})          // postId -> Set of author ids
  const [urls, setUrls] = useState({})            // storage path -> signed url
  const [pending, setPending] = useState([])      // uploaded, not yet posted: { path, kind, name, preview, size }
  const [uploading, setUploading] = useState(0)
  const [posting, setPosting] = useState(false)
  const [pollMode, setPollMode] = useState(false)
  const [pollOpts, setPollOpts] = useState(['', ''])
  const [pollOptions, setPollOptions] = useState({}) // postId -> options
  const [pollVotes, setPollVotes] = useState({})     // postId -> votes
  const [mediaReady, setMediaReady] = useState(true) // false until migration 138 is run

  async function sign(items) {
    const paths = mediaPaths(items).filter(p => !urls[p])
    if (!paths.length) return
    const { data } = await supabase.storage.from(COMMUNITY_BUCKET).createSignedUrls(paths, 60 * 60 * 6)
    const add = Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
    setUrls(u => ({ ...u, ...add }))
  }

  async function loadPolls(pollIds) {
    if (!pollIds.length) { setPollOptions({}); setPollVotes({}); return }
    const [{ data: opts }, { data: votes }] = await Promise.all([
      supabase.from('community_poll_options').select('*').in('post_id', pollIds).order('position'),
      supabase.from('community_poll_votes').select('*').in('post_id', pollIds),
    ])
    const o = {}, v = {}
    for (const x of opts || []) (o[x.post_id] ||= []).push(x)
    for (const x of votes || []) (v[x.post_id] ||= []).push(x)
    setPollOptions(o); setPollVotes(v)
  }

  async function load() {
    const [{ data: p }, people, { data: lk }] = await Promise.all([
      supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.rpc('community_profiles'),
      supabase.from('community_likes').select('*'),
    ])
    const list = p || []
    setPosts(list)
    let profs = people.data
    if (people.error) {
      setMediaReady(false)   // migration 138 not run yet: fall back to what the old feed did
      profs = (await supabase.from('profiles').select('id, full_name')).data
    }
    setNames(Object.fromEntries((profs || []).map(x => [x.id, x])))
    const byPost = {}
    for (const l of lk || []) (byPost[l.post_id] ||= new Set()).add(l.author_id)
    setLikes(byPost)
    sign(list)
    loadPolls(list.filter(x => x.post_type === 'poll').map(x => x.id))
  }
  useEffect(() => { if (profile) load() }, [profile])

  const nameOf = id => {
    const n = names[id]
    if (id === profile?.id) return n?.full_name || 'You'
    return n?.full_name || 'Athlete'
  }

  // ---- composing ----
  async function addFiles(fileList) {
    const files = [...(fileList || [])]
    if (!files.length) return
    const err = checkAttachments(pending, files)
    if (err) { alert(err); return }
    for (const f of files) {
      if (mediaKind(f) === 'video') {
        const s = await videoSeconds(f)
        if (s > MAX_VIDEO_SECONDS + 0.5) { alert(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds — that one is ${Math.round(s)}.`); return }
      }
    }
    setUploading(n => n + files.length)
    for (const raw of files) {
      const kind = mediaKind(raw)
      const file = kind === 'image' ? await prepareImage(raw) : raw
      const path = mediaPath(profile.id, file)
      const { error } = await supabase.storage.from(COMMUNITY_BUCKET).upload(path, file, { contentType: file.type })
      setUploading(n => n - 1)
      if (error) { alert('Upload failed: ' + error.message); continue }
      setPending(list => [...list, { path, kind, name: raw.name, size: file.size, preview: URL.createObjectURL(file) }])
    }
  }

  async function addVoice(path) {
    const err = checkAttachments(pending, [{ type: 'audio/webm', size: 0, name: 'voice note' }])
    if (err) { alert(err); supabase.storage.from(COMMUNITY_BUCKET).remove([path]); return }
    const { data } = await supabase.storage.from(COMMUNITY_BUCKET).createSignedUrl(path, 3600)
    setPending(list => [...list, { path, kind: 'audio', name: 'Voice note', preview: data?.signedUrl }])
  }

  function dropPending(path) {
    setPending(list => list.filter(x => x.path !== path))
    supabase.storage.from(COMMUNITY_BUCKET).remove([path])
  }

  const pollLabels = pollOpts.map(s => s.trim()).filter(Boolean)
  const canPost = !posting && !uploading && (pollMode ? body.trim() && pollLabels.length >= 2 : body.trim() || pending.length)

  async function post() {
    if (!canPost) return
    setPosting(true)
    const media = pending.map(({ path, kind, name }) => ({ path, kind, name }))
    const row = { author_id: profile.id, body: body.trim(), ...(mediaReady ? { media, post_type: pollMode ? 'poll' : 'post' } : {}) }
    const { data: created, error } = await supabase.from('community_posts').insert(row).select().single()
    if (error) { setPosting(false); alert('Could not post: ' + error.message); return }
    if (pollMode) {
      const { error: oErr } = await supabase.from('community_poll_options').insert(pollLabels.map((label, i) => ({ post_id: created.id, label, position: i })))
      if (oErr) alert('Poll posted, but its options failed to save: ' + oErr.message)
    }
    // keep the local previews as the links for what was just posted
    setUrls(u => ({ ...u, ...Object.fromEntries(pending.filter(p => p.preview).map(p => [p.path, p.preview])) }))
    setBody(''); setPending([]); setPollMode(false); setPollOpts(['', '']); setPosting(false)
    load()
  }

  // ---- reacting ----
  async function toggleLike(postId) {
    const liked = likes[postId]?.has(profile.id)
    if (liked) await supabase.from('community_likes').delete().eq('post_id', postId).eq('author_id', profile.id)
    else await supabase.from('community_likes').insert({ post_id: postId, author_id: profile.id })
    load()
  }

  async function vote(postId, optionId) {
    const prev = pollVotes[postId] || []
    if (prev.find(v => v.voter_id === profile.id)?.option_id === optionId) return
    setPollVotes(v => ({ ...v, [postId]: [...prev.filter(x => x.voter_id !== profile.id), { post_id: postId, option_id: optionId, voter_id: profile.id }] }))
    const { error } = await supabase.rpc('cast_poll_vote', { pid: postId, oid: optionId })
    if (error) { setPollVotes(v => ({ ...v, [postId]: prev })); alert('Could not vote: ' + error.message) }
  }

  async function toggleClosed(p) {
    const { error } = await supabase.from('community_posts').update({ poll_closed: !p.poll_closed }).eq('id', p.id)
    if (error) alert('Could not update the poll: ' + error.message)
    else setPosts(list => list.map(x => x.id === p.id ? { ...x, poll_closed: !p.poll_closed } : x))
  }

  async function loadComments(id) {
    const { data } = await supabase.from('community_comments').select('*').eq('post_id', id).order('created_at')
    setComments(c => ({ ...c, [id]: data || [] }))
    sign(data || [])
  }

  async function openPost(id) {
    if (open === id) { setOpen(null); return }
    setOpen(id); setReply('')
    loadComments(id)
  }

  async function sendComment(postId) {
    if (!reply.trim()) return
    const body = reply.trim()
    setReply('')
    await supabase.from('community_comments').insert({ post_id: postId, author_id: profile.id, body })
    loadComments(postId)
  }

  async function sendVoiceComment(postId, path) {
    const { error } = await supabase.from('community_comments').insert({ post_id: postId, author_id: profile.id, body: '', media: [{ path, kind: 'audio', name: 'Voice note' }] })
    if (error) alert('Could not send: ' + error.message)
    loadComments(postId)
  }

  async function deletePost(p) {
    if (!confirm('Delete this post?')) return
    await supabase.from('community_posts').delete().eq('id', p.id)
    const files = mediaPaths([p])
    if (files.length) supabase.storage.from(COMMUNITY_BUCKET).remove(files)
    load()
  }
  async function deleteComment(postId, c) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('community_comments').delete().eq('id', c.id)
    const files = mediaPaths([c])
    if (files.length) supabase.storage.from(COMMUNITY_BUCKET).remove(files)
    loadComments(postId)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: isCoach ? 700 : undefined }}>
      {!isCoach && (
        <header>
          <div className="eyebrow">Roster</div>
          <h1 style={{ fontSize: 24, marginTop: 4 }}>Community</h1>
        </header>
      )}
      {isCoach && (
        <>
          <div className="eyebrow">Roster</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 16px' }}>Community</h1>
        </>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea rows="2" placeholder={pollMode ? 'Ask the crew a question…' : 'Share something with the crew…'} value={body} onChange={e => setBody(e.target.value)} />

        {pollMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pollOpts.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input placeholder={`Option ${i + 1}`} value={o} maxLength={120} onChange={e => setPollOpts(list => list.map((x, j) => j === i ? e.target.value : x))} />
                {pollOpts.length > 2 && <button className="btn-ghost" style={{ padding: '6px 10px' }} aria-label="Remove option" onClick={() => setPollOpts(list => list.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
            {pollOpts.length < 6 && <button className="btn-ghost" style={{ alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12.5 }} onClick={() => setPollOpts(l => [...l, ''])}>+ Add option</button>}
          </div>
        )}

        {(pending.length > 0 || uploading > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pending.map(p => (
              <div key={p.path} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--steel)' }}>
                {p.kind === 'image' && <img src={p.preview} alt="" style={{ width: 84, height: 84, objectFit: 'cover', display: 'block' }} />}
                {p.kind === 'video' && <video src={p.preview} muted playsInline style={{ width: 120, height: 84, objectFit: 'cover', display: 'block', background: '#000' }} />}
                {p.kind === 'audio' && (p.preview ? <audio src={p.preview} controls style={{ height: 36, width: 220, margin: 6 }} /> : <span style={{ display: 'block', padding: 10, fontSize: 12 }}>🎙 Voice note</span>)}
                <button onClick={() => dropPending(p.path)} aria-label="Remove attachment"
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 11, padding: 0 }}>✕</button>
              </div>
            ))}
            {uploading > 0 && <div className="muted" style={{ width: 84, height: 84, display: 'grid', placeItems: 'center', fontSize: 12, border: '1px dashed var(--line)', borderRadius: 8 }}>Uploading…</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {mediaReady && !pollMode && (
            <>
              <label className="btn-ghost" style={iconBtn} title="Photo or GIF">
                📷 Photo
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
              <label className="btn-ghost" style={iconBtn} title={`Video up to ${MAX_VIDEO_SECONDS} seconds`}>
                🎬 Video
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
              <VoiceRecorder userId={profile?.id} bucket={COMMUNITY_BUCKET} onSent={addVoice} />
            </>
          )}
          {mediaReady && isCoach && (
            <button className={pollMode ? 'btn' : 'btn-ghost'} style={iconBtn}
              onClick={() => { if (!pollMode && pending.length) { alert('Remove the attachments first — a poll is just a question and options.'); return } setPollMode(m => !m) }}>
              📊 Poll
            </button>
          )}
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={post} disabled={!canPost}>
            {posting ? 'Posting…' : uploading ? 'Uploading…' : pollMode ? 'Post poll' : 'Post'}
          </button>
        </div>
      </div>

      {posts.map(p => {
        const likeCount = likes[p.id]?.size || 0
        const iLiked = likes[p.id]?.has(profile?.id)
        const author = names[p.author_id]
        return (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Avatar url={author?.avatar_url} name={author?.full_name} size={28} />
                <strong style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(p.author_id)}</strong>
                {author?.role === 'coach' && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: '#000', background: 'var(--orange)', borderRadius: 6, padding: '1px 6px' }}>COACH</span>}
                {p.post_type === 'poll' && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--orange-hot)', border: '1px solid var(--orange-hot)', borderRadius: 6, padding: '1px 6px' }}>POLL</span>}
              </span>
              <span className="muted" style={{ fontSize: 11.5, flexShrink: 0 }}>{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
            {p.body && <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontWeight: p.post_type === 'poll' ? 700 : undefined }}>{p.body}</p>}
            <MediaView media={p.media} urls={urls} />
            {p.post_type === 'poll' && (
              <Poll post={p} options={pollOptions[p.id] || []} votes={pollVotes[p.id] || []} me={profile?.id} isCoach={isCoach} names={names}
                onVote={oid => vote(p.id, oid)} onToggleClosed={() => toggleClosed(p)} />
            )}
            <div style={{ display: 'flex', gap: 14, marginTop: 10, alignItems: 'center' }}>
              <button onClick={() => toggleLike(p.id)} style={{ background: 'none', fontSize: 12.5, fontWeight: 700, color: iLiked ? 'var(--orange-hot)' : 'var(--muted)' }}>
                {iLiked ? '● Liked' : '○ Like'} {likeCount > 0 ? `(${likeCount})` : ''}
              </button>
              <button onClick={() => openPost(p.id)} style={{ background: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>💬 Comment</button>
              {(isCoach || p.author_id === profile?.id) && (
                <button onClick={() => deletePost(p)} style={{ background: 'none', fontSize: 12.5, color: 'var(--red)', marginLeft: 'auto' }}>Delete</button>
              )}
            </div>

            {open === p.id && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                {(comments[p.id] || []).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, minWidth: 0, flex: 1 }}>
                      <strong>{nameOf(c.author_id)}: </strong>{c.body}
                      <MediaView media={c.media} urls={urls} compact />
                    </div>
                    {(isCoach || c.author_id === profile?.id) && (
                      <button onClick={() => deleteComment(p.id, c)} style={{ background: 'none', color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input placeholder="Add a comment…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment(p.id)} />
                  {mediaReady && <VoiceRecorder userId={profile?.id} bucket={COMMUNITY_BUCKET} onSent={path => sendVoiceComment(p.id, path)} />}
                  <button className="btn-ghost" onClick={() => sendComment(p.id)}>Send</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {posts.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No posts yet — be the first to say what's up.</p>}
    </div>
  )
}
