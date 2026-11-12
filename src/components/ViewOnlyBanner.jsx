// Shown to assistants on pages they can look at but not change (Update 179).
import { Eye } from 'lucide-react'

export default function ViewOnlyBanner({ what, also }) {
  return (
    <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, borderColor: 'var(--orange)' }}>
      <Eye size={18} color="var(--orange)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 13.5 }}>
        <strong>View only.</strong> {what} can only be created or changed by the coach.
        {also && <span className="muted"> {also}</span>}
      </div>
    </div>
  )
}
