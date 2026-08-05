import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Shared community feed — used by both client and coach views.
// isCoach controls moderation ability (delete any post/comment).
export default function ClientCommunity({ isCoach = false }) {
  const { profile } = useAuth()
  const [posts, setPosts] = useState([])
  const [names, setNames] = useState({})
  const [body, setBody] = useState('')
  const [open, setOpen] = useState(null)
  const [comments, setComments] = useState({})
  const [reply, setReply] = useState('')
  const [likes, setLikes] = useState({}) // postId -> Set of author ids

  async function load() {
    const [{ data: p }, { data: profs }, { data: lk }] = await Promise.all([
      supabase.from('community_posts').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('community_likes').select('*'),
    ])
    setPosts(p || [])
    setNames(Object.fromEntries((profs || []).map(x => [x.id, x.full_name || (x.id === profile?.id ? 'You' : 'Athlete')])))
    const byPost = {}
    for (const l of lk || []) (byPost[l.post_id] ||= new Set()).add(l.author_id)
    setLikes(byPost)
  }
  useEffect(() => { if (profile) load() }, [profile])

  async function post() {
    if (!body.trim()) return
    await supabase.from('community_posts').insert({ author_id: profile.id, body: body.trim() })
    setBody(''); load()
  }

  async function toggleLike(postId) {
    const liked = likes[postId]?.has(profile.id)
    if (liked) await supabase.from('community_likes').delete().eq('post_id', postId).eq('author_id', profile.id)
    else await supabase.from('community_likes').insert({ post_id: postId, author_id: profile.id })
    load()
  }

  async function openPost(id) {
    if (open === id) { setOpen(null); return }
    setOpen(id)
    const { data } = await supabase.from('community_comments').select('*').eq('post_id', id).order('created_at')
    setComments(c => ({ ...c, [id]: data || [] }))
  }

  async function sendComment(postId) {
    if (!reply.trim()) return
    const body = reply.trim()
    setReply('')
    await supabase.from('community_comments').insert({ post_id: postId, author_id: profile.id, body })
    const { data } = await supabase.from('community_comments').select('*').eq('post_id', postId).order('created_at')
    setComments(c => ({ ...c, [postId]: data || [] }))
  }

  async function deletePost(id) {
    if (!confirm('Delete this post?')) return
    await supabase.from('community_posts').delete().eq('id', id)
    load()
  }
  async function deleteComment(postId, id) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('community_comments').delete().eq('id', id)
    const { data } = await supabase.from('community_comments').select('*').eq('post_id', postId).order('created_at')
    setComments(c => ({ ...c, [postId]: data || [] }))
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
        <textarea rows="2" placeholder="Share something with the crew…" value={body} onChange={e => setBody(e.target.value)} />
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={post} disabled={!body.trim()}>Post</button>
      </div>

      {posts.map(p => {
        const likeCount = likes[p.id]?.size || 0
        const iLiked = likes[p.id]?.has(profile?.id)
        return (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 14 }}>{names[p.author_id] || 'Athlete'}</strong>
              <span className="muted" style={{ fontSize: 11.5 }}>{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
            <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.body}</p>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, alignItems: 'center' }}>
              <button onClick={() => toggleLike(p.id)} style={{ background: 'none', fontSize: 12.5, fontWeight: 700, color: iLiked ? 'var(--orange-hot)' : 'var(--muted)' }}>
                {iLiked ? '● Liked' : '○ Like'} {likeCount > 0 ? `(${likeCount})` : ''}
              </button>
              <button onClick={() => openPost(p.id)} style={{ background: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>💬 Comment</button>
              {(isCoach || p.author_id === profile?.id) && (
                <button onClick={() => deletePost(p.id)} style={{ background: 'none', fontSize: 12.5, color: 'var(--red)', marginLeft: 'auto' }}>Delete</button>
              )}
            </div>

            {open === p.id && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                {(comments[p.id] || []).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 13 }}><strong>{names[c.author_id] || 'Athlete'}: </strong>{c.body}</div>
                    {(isCoach || c.author_id === profile?.id) && (
                      <button onClick={() => deleteComment(p.id, c.id)} style={{ background: 'none', color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input placeholder="Add a comment…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment(p.id)} />
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
