import { useRef, useState } from 'react'
import { supabase } from './supabase'

// Records a short voice note, uploads it, and calls onSent(path) when done.
// Defaults to the 1-on-1 voice-notes bucket under the user's own folder; group
// chats pass bucket="group-files" and folder="<group id>/<user id>".
export default function VoiceRecorder({ userId, onSent, bucket = 'voice-notes', folder }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => chunksRef.current.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (blob.size > 500) {
          setBusy(true)
          const path = `${folder || userId}/${Date.now()}.webm`
          const { error } = await supabase.storage.from(bucket).upload(path, blob)
          if (error) {
            alert('Could not upload voice note: ' + error.message)
          } else {
            await onSent(path)
          }
          setBusy(false)
        } else {
          alert('Recording was empty — try again and speak right after tapping record.')
        }
      }
      mediaRef.current = mr
      mr.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      alert('Could not access your microphone — check your browser permissions.')
    }
  }

  function stop() {
    mediaRef.current?.stop()
    clearInterval(timerRef.current)
    setRecording(false)
  }

  if (busy) return <button className="btn-ghost" disabled style={{ padding: '10px 14px' }}>Sending…</button>

  return recording ? (
    <button className="btn" style={{ padding: '10px 14px', background: 'var(--red)' }} onClick={stop}>
      ● {String(Math.floor(seconds / 60)).padStart(1,'0')}:{String(seconds % 60).padStart(2,'0')} — Stop
    </button>
  ) : (
    <button className="btn-ghost" style={{ padding: '10px 14px' }} onClick={start} title="Record a voice note">🎙</button>
  )
}
