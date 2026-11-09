'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Team access code: checked on the server (app/api/staff-code); the code never appears in this file.
// mode: 'staff' | 'hiring' | 'candidate' (candidate also asks for the candidate's email)
export default function CodeLogin({ mode = 'staff' }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/staff-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, mode, email: mail }) })
      const j = await r.json()
      if (!r.ok) { setErr(j.error || 'เข้าไม่ได้'); return }
      const { error } = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' })
      if (error) setErr(error.message)
    } catch { setErr('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง') } finally { setBusy(false) }
  }
  if (!open) return <p style={{ textAlign: 'center' }}><button className="btn" onClick={() => setOpen(true)}>เข้าด้วยรหัสทีม</button></p>
  return (
    <div className="panel">
      <b>เข้าด้วยรหัสทีม</b>
      {mode === 'candidate' && <label className="f">อีเมลของแคนดิเดตที่ต้องการเข้า<input type="text" autoComplete="off" value={mail} onChange={(e) => setMail(e.target.value)} /></label>}
      <label className="f">ชื่อผู้ใช้ (บันทึกไว้ใน log)<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="f">รหัส<input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
      <div style={{ marginTop: 12 }}><button className="btn pri" disabled={busy} onClick={go}>เข้าสู่ระบบ</button></div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
