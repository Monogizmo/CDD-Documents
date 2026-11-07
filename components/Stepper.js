'use client'
import { reqd, okCat } from '../lib/categories'

// Smart onboarding checklist: submit -> verify -> sign -> ready to start
export default function Stepper({ c, docs }) {
  const my = docs.filter((d) => d.candidate_id === c.id), r = reqd(c)
  const sent = r.filter((k) => okCat(my, c, k)).length
  const passed = r.filter((k) => { const l = my.filter((d) => d.category === k[0]); return l.length > 0 && l.every((d) => d.status === 'ok') }).length
  const fix = my.filter((d) => d.status === 'fix').length
  const steps = [
    { t: 'ส่งเอกสาร', d: `${sent}/${r.length} หมวดบังคับ`, done: sent === r.length },
    { t: 'ตรวจสอบเอกสาร', d: fix ? `ต้องแก้ไข ${fix} ไฟล์` : `ผ่านแล้ว ${passed}/${r.length}`, done: sent === r.length && passed === r.length, warn: fix > 0 },
    { t: 'เซ็นเอกสาร', d: c.signed_at ? 'เรียบร้อย' : 'HR จะแจ้งให้ทราบ', done: !!c.signed_at },
    { t: 'เตรียมพร้อมเริ่มงาน', d: c.ready_at ? 'พร้อมแล้ว' : 'รอขั้นตอนก่อนหน้า', done: !!c.ready_at },
  ]
  const cur = steps.findIndex((s) => !s.done)
  return (
    <div className="panel steps">
      {steps.map((s, i) => (
        <div key={i} className={'step' + (s.done ? ' done' : i === cur ? ' cur' : '') + (s.warn ? ' warn' : '')}>
          <div className="dot">{s.done ? '✓' : i + 1}</div>
          <div className="st">{s.t}</div>
          <div className="sd">{s.d}</div>
        </div>
      ))}
    </div>
  )
}
