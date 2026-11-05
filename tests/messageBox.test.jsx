// @vitest-environment jsdom
// Message composer (Update 170): Enter sends on a computer, Shift+Enter is a new line.
import { test, expect } from 'vitest'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import MessageBox from '../src/components/MessageBox'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
test('Enter sends, Shift+Enter does not, Send button sends', async () => {
  const sent = []
  function Demo() { const [t, setT] = useState('hello'); return <MessageBox value={t} onChange={setT} onSend={() => sent.push(t)} placeholder="Message…" /> }
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => createRoot(el).render(<Demo />))
  const ta = el.querySelector('textarea')
  expect(ta).toBeTruthy(); expect(ta.getAttribute('aria-label')).toBe('Message…')
  await act(async () => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })))
  expect(sent).toHaveLength(0)
  await act(async () => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(sent).toEqual(['hello'])
  await act(async () => [...el.querySelectorAll('button')].find(b => b.textContent === 'Send').click())
  expect(sent).toHaveLength(2)
})
