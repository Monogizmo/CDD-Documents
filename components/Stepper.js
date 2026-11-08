'use client'
import { reqd, okCat } from '../lib/categories'

// Document collection progress only: submit -> HR review -> complete.
// rdone (HR view only): is the recruiter-side checklist complete too?
export default function Stepper({ c, docs, rdone }) {
  const my = docs.filter((d) => d.candidate_id === c.id), r = reqd(c)
  const sent = r.filter((k) => okCat(my, c, k)).length
  const passed = r.filter((k) => { const l = my.filter((d) => d.category === k[0]); return l.length > 0 && l.every((d) => d.status === 'ok') }).length
  const fix = my.filter((d) => d.status === 'fix').length
  const checked = sent === r.length && passed === r.length
  const all = checked && rdone !== false
  const steps = [
    { t: 'ส่งเอกสาร', d: `${sent}/${r.length} หมวดบังคับ`, done: sent === r.length },
    { t: 'HR ตรวจสอบ', d: fix ? `Revision Required ${fix} ไฟล์` : `Verified ${passed}/${r.length}`, done: checked, warn: fix > 0 },
    { t: 'เอกสารครบถ้วน', d: all ? 'ครบถ้วนแล้ว' : checked ? 'รอเอกสารฝั่ง Recruiter' : 'รอขั้นตอนก่อนหน้า', done: all },
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
