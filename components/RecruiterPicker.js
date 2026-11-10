'use client'
import { useState } from 'react'

// Recruiter drop-down. `names` = the managed list. A name that is no longer in the list (removed later) still shows for the Candidates that have it.
// manage = true adds the "จัดการรายชื่อ" panel (add a new name, remove a name).
export function RecruiterSelect({ names, value, onChange, placeholder = '— เลือก Recruiter —', allowEmpty = true, ...rest }) {
  const extra = value && !names.includes(value) ? [value] : []
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {[...names, ...extra].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

export function RecruiterManager({ rec, usage = {}, onClose }) {
  const [v, setV] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  async function add() { setBusy(true); const e = await rec.add(v); setBusy(false); setErr(e); if (!e) setV('') }
  async function del(n) {
    const u = usage[n] || 0
    if (!confirm('ลบ ' + n + ' ออกจากรายชื่อ Recruiter?' + (u ? '\n\nยังมี ' + u + ' Candidate ที่ใช้ชื่อนี้ ชื่อจะยังแสดงที่ Candidate เหล่านั้นตามเดิม' : ''))) return
    setErr(await rec.remove(n))
  }
  return (
    <div className="rm">
      <div className="fl"><b>รายชื่อ Recruiter ({rec.names.length})</b><button type="button" className="btn sm" onClick={onClose}>ปิด</button></div>
      {!rec.shared && <div className="hint" style={{ color: 'var(--warn)' }}>ยังไม่ได้รัน migration 012 รายชื่อที่เพิ่มหรือลบจะบันทึกในเบราว์เซอร์นี้เท่านั้น (รัน supabase/migrations/012_recruiters.sql เพื่อใช้รายชื่อร่วมกันทั้งทีม)</div>}
      <ul>{rec.names.map((n) => <li key={n}><span>{n}{usage[n] ? <span className="sub"> · {usage[n]}</span> : null}</span><button type="button" aria-label={'ลบ ' + n} title="ลบออกจากรายชื่อ" onClick={() => del(n)}>×</button></li>)}</ul>
      <div className="addrow">
        <input type="text" value={v} placeholder="ชื่อ Recruiter ใหม่ เช่น Firstname Lastname" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="btn pri" disabled={busy || !v.trim()} onClick={add}>เพิ่ม</button>
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
