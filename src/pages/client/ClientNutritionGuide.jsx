// Group members: the written nutrition guide (Update 181). The coach's saved
// version if there is one, otherwise the built-in guide.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { marked } from 'marked'
import { BookOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DEFAULT_GUIDE, GUIDE_TITLE } from '../../lib/nutritionGuide'

export function guideHtml(md) {
  return marked.parse(String(md || '').trim() || DEFAULT_GUIDE)
}

// Eat tab: the way in
export function NutritionGuideCard() {
  return (
    <Link to="/app/nutrition/guide" className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, textDecoration: 'none', color: 'inherit' }}>
      <BookOpen size={22} color="var(--orange)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 14 }}>
        <b>Nutrition guide</b><br />
        <span className="muted" style={{ fontSize: 13 }}>Your numbers, the daily standard, eating on the road, when to adjust.</span>
      </div>
      <span style={{ color: 'var(--orange-hot)', fontWeight: 800 }}>›</span>
    </Link>
  )
}

export default function ClientNutritionGuide() {
  const [guide, setGuide] = useState(null)
  useEffect(() => {
    supabase.from('group_guides').select('title, body_md').eq('id', 'nutrition').maybeSingle()
      .then(({ data }) => setGuide(data || {}))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link to="/app/nutrition" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>‹ Back to Eat</Link>
      <header>
        <div className="eyebrow">Nutrition</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>{guide?.title || GUIDE_TITLE}</h1>
      </header>
      {guide === null ? <p className="muted">Loading…</p> : (
        <div className="card guide-md" dangerouslySetInnerHTML={{ __html: guideHtml(guide.body_md) }} />
      )}
    </div>
  )
}
