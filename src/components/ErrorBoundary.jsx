// If a screen crashes, show a way out instead of a blank page, and report it
// (Update 167).
import React from 'react'
import { reportError } from '../lib/errorLog'

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { broke: false } }
  static getDerivedStateFromError() { return { broke: true } }
  componentDidCatch(error, info) { reportError(Object.assign(error || {}, { stack: `${error?.stack || ''}\n${info?.componentStack || ''}` }), 'crash') }
  render() {
    if (!this.state.broke) return this.props.children
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 380, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="eyebrow">Something went wrong</div>
          <p style={{ fontSize: 15, margin: 0 }}>That screen hit a snag. Your logged data is safe. Coach has been sent the details.</p>
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn-ghost" onClick={() => { window.location.href = '/' }}>Go to Home</button>
        </div>
      </div>
    )
  }
}
