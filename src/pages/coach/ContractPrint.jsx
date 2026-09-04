import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ContractPrint() {
  const { contractId } = useParams()
  const [data, setData] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    supabase.from('contracts').select('*').eq('id', contractId).maybeSingle().then(({ data: contract }) => {
      if (!contract) { setNotFound(true); return }
      supabase.from('profiles').select('full_name').eq('id', contract.client_id).maybeSingle().then(({ data: client }) => {
        setData({ contract, client })
      })
    })
  }, [contractId])

  if (notFound) return <div style={{ padding: 40 }}>Contract not found, or you don't have access to it.</div>
  if (!data) return <div style={{ padding: 40 }}>Loading…</div>

  const { contract, client } = data

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', background: '#fff', padding: 30, maxWidth: 800, margin: '0 auto', minHeight: '100vh' }}>
      <style>{`
        @media print { body { background: #fff !important; } .no-print { display: none; } }
      `}</style>

      <div className="no-print" style={{ marginBottom: 16 }}>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#FF5A00', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>Print / Save as PDF</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #0A0A0A', paddingBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#FF5A00', fontWeight: 700, letterSpacing: '0.1em' }}>WORKHORSE TRAINING &amp; NUTRITION</div>
          <h1 style={{ fontSize: 24, margin: '4px 0 0' }}>{contract.title}</h1>
        </div>
        <div style={{ fontSize: 12, color: '#666', textAlign: 'right' }}>
          {client?.full_name && <div>{client.full_name}</div>}
          <div>Sent {new Date(contract.sent_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {contract.body}
      </div>

      <div style={{ marginTop: 40, borderTop: '1px solid #ddd', paddingTop: 16 }}>
        {contract.status === 'signed' ? (
          <>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Signed by</div>
            <div style={{ fontFamily: "'Caveat', 'Segoe Script', cursive", fontSize: 34, color: '#111' }}>{contract.signature_name}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{new Date(contract.signed_at).toLocaleString()}</div>
          </>
        ) : contract.status === 'void' ? (
          <div style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>This contract was voided and was never signed.</div>
        ) : (
          <div style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>Not yet signed.</div>
        )}
      </div>
    </div>
  )
}
