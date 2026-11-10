'use client'
import { useState } from 'react'
import { nm, base, lblS, rlblS } from '../lib/categories'
import { STAGE_NAME } from '../lib/stage'
import { saveBlob } from '../lib/zipper'

// Reports: one card per Recruiter. No company-wide overview: each Recruiter sees what is stuck on their own Candidates
// (files waiting for review, revisions, the documents that are missing most often, who has waited longest).
const csv = (rows) => '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')
const NONE = '(ยังไม่ระบุ Recruiter)'
const days = (c) => Math.max(0, Math.floor((Date.now() - new Date(c.created_at || Date.now()).getTime()) / 86400000))
const top = (list, key, n = 3) => {
  const m = {}
  list.forEach((r) => key(r).forEach((t) => { m[t] = (m[t] || 0) + 1 }))
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n)
}
const nameOf = (c) => (c.first_name ? base(c) : c.email)

function stats(list) {
  const n = list.length, sum = (f) => list.reduce((a, r) => a + f(r), 0)
  const need = sum((r) => r.n), sent = sum((r) => r.n - r.miss.length)
  const open = list.filter((r) => !r.both).sort((a, b) => days(b.c) - days(a.c))
  return {
    n, sales: list.filter((r) => r.c.sales_type === 'sales').length, non: list.filter((r) => r.c.sales_type === 'non_sales').length,
    both: list.filter((r) => r.both).length, cd: list.filter((r) => r.candDone).length, rd: list.filter((r) => r.recDone).length,
    w: sum((r) => r.w), x: sum((r) => r.x), missPeople: list.filter((r) => r.miss.length).length,
    pct: need ? Math.round((sent / need) * 100) : 0,
    noDocs: list.filter((r) => !r.m.length && !r.mr.length).length,
    hiring: list.filter((r) => r.c.offer_made).length, ready: list.filter((r) => r.both && !r.c.offer_made).length,
    topMiss: top(list, (r) => r.miss.map(lblS)), topRMiss: top(list, (r) => r.rmiss.map(rlblS), 2),
    oldest: open[0] || null,
  }
}
function insights(s) {
  const out = []
  if (s.x) out.push(['warn', `มี ${s.x} ไฟล์รอ Candidate แก้ไข`])
  if (s.w) out.push(['', `${s.w} ไฟล์ส่งมาแล้ว รอ HR ตรวจ`])
  if (s.noDocs) out.push(['warn', `${s.noDocs} คนยังไม่ส่งเอกสารเลย`])
  if (s.topMiss.length) out.push(['', 'เอกสารที่ Candidate ยังขาดบ่อยสุด: ' + s.topMiss.map(([t, k]) => `${t} (${k} คน)`).join(', ')])
  if (s.topRMiss.length) out.push(['', 'ฝั่ง Recruiter ที่ยังขาดบ่อยสุด: ' + s.topRMiss.map(([t, k]) => `${t} (${k} คน)`).join(', ')])
  if (s.oldest && days(s.oldest.c) >= 7) out.push(['warn', `ค้างนานสุด: ${nameOf(s.oldest.c)} (${days(s.oldest.c)} วันนับจากเพิ่มในระบบ)`])
  if (s.ready) out.push(['good', `พร้อมส่งให้ Hiring ${s.ready} คน (เอกสารครบทั้งสองฝั่งแล้ว)`])
  if (!out.length) out.push(['good', s.n && s.both === s.n ? 'เอกสารครบทั้งสองฝั่งทุกคนแล้ว' : 'ยังไม่มีงานค้าง'])
  return out
}

function Card({ name, list, openAll }) {
  const [open, setOpen] = useState(!!openAll)
  const s = stats(list), ins = insights(s)
  return (
    <section className="rcard">
      <div className="rch">
        <div><h2>{name}</h2><div className="sub">{s.n} Candidate · Sales {s.sales} · Non-Sales {s.non}{s.n - s.sales - s.non > 0 ? ' · ยังไม่ระบุประเภท ' + (s.n - s.sales - s.non) : ''}</div></div>
        <div className="sub">ครบทั้งสองฝั่ง <b style={{ color: 'var(--ink)' }}>{s.both}</b>/{s.n}{s.hiring ? ' · ส่งให้ Hiring แล้ว ' + s.hiring : ''}</div>
      </div>
      <div className="rmx">
        <div className={s.w ? 'gold' : ''}><b>{s.w}</b><span>ไฟล์รอ HR ตรวจ</span></div>
        <div className={s.x ? 'hot' : ''}><b>{s.x}</b><span>ไฟล์รอแก้ไข</span></div>
        <div className={s.missPeople ? 'gold' : ''}><b>{s.missPeople}</b><span>คนที่ยังขาดเอกสาร</span></div>
        <div><b>{s.cd}</b><span>ฝั่ง Candidate ครบ</span></div>
        <div><b>{s.rd}</b><span>ฝั่ง Recruiter ครบ</span></div>
      </div>
      <div className="rcp"><span>เอกสารบังคับที่ส่งแล้ว</span><div className="bar"><i style={{ width: s.pct + '%' }} /></div><b style={{ color: 'var(--ink)' }}>{s.pct}%</b></div>
      <ul className="ins">{ins.map(([k, t], i) => <li key={i} className={k}>{t}</li>)}</ul>
      <div className="rtl">
        <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'ซ่อนรายชื่อ Candidate' : 'ดูรายชื่อ Candidate (' + s.n + ')'}</button>
        {open && (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>ชื่อ</th><th>SRF · ตำแหน่ง</th><th>ประเภท</th><th>เอกสารบังคับ</th><th>Candidate</th><th>Recruiter</th><th>ขั้นตอน</th></tr></thead>
            <tbody>{[...list].sort((a, b) => b.x + b.w + b.miss.length - (a.x + a.w + a.miss.length)).map((r) => (
              <tr key={r.c.id}>
                <td><b>{nameOf(r.c)}</b>{r.x > 0 && <> <span className="tag bad">แก้ไข {r.x}</span></>}{r.w > 0 && <> <span className="tag">รอตรวจ {r.w}</span></>}</td>
                <td>{r.c.srf_no}<div className="sub">{r.c.position}</div></td>
                <td>{r.c.sales_type === 'sales' ? 'Sales' : r.c.sales_type === 'non_sales' ? 'Non-Sales' : '-'}</td>
                <td style={{ minWidth: 120 }}><div className="bar"><i style={{ width: (r.n ? ((r.n - r.miss.length) / r.n) * 100 : 0) + '%' }} /></div>{r.n - r.miss.length}/{r.n}</td>
                <td>{r.candDone ? <span className="tag ok">ครบ</span> : <span className="tag g">ยังไม่ครบ</span>}</td>
                <td>{r.recDone ? <span className="tag ok">ครบ</span> : <span className="tag">{r.rn - r.rmiss.length}/{r.rn}</span>}</td>
                <td>{STAGE_NAME[r.stage]}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </section>
  )
}

export default function Reports({ rows }) {
  const [pick, setPick] = useState('')
  const by = {}
  rows.forEach((r) => { const k = r.c.recruiter_name || NONE; (by[k] = by[k] || []).push(r) })
  // busiest Recruiter first: files waiting + revisions + people with missing documents
  const load = (l) => l.reduce((a, r) => a + r.w + r.x + (r.miss.length ? 1 : 0), 0)
  const names = Object.keys(by).sort((a, b) => load(by[b]) - load(by[a]) || by[b].length - by[a].length || a.localeCompare(b))
  const shown = pick && by[pick] ? [pick] : names

  const head = ['Recruiter', 'ชื่อ', 'อีเมล', 'SRF', 'ตำแหน่ง', 'ประเภท', 'ส่งเอกสารบังคับ', 'ขาดเอกสารบังคับ', 'Received', 'Pending', 'Verified', 'Revision Required', 'Recruiter checklist', 'ฝั่ง Candidate ครบ', 'ฝั่ง Recruiter ครบ', 'ครบทั้งสองฝั่ง', 'ขั้นตอน']
  const lines = names.flatMap((k) => by[k].map((r) => [r.c.recruiter_name || '', nameOf(r.c), r.c.email, r.c.srf_no, r.c.position, r.c.sales_type === 'sales' ? 'Sales' : r.c.sales_type === 'non_sales' ? 'Non-Sales' : '', `${r.n - r.miss.length}/${r.n}`, r.miss.map((c) => nm(c[0]) + c[1]).join(' | '), r.rc, r.pd, r.m.filter((d) => d.status === 'ok').length, r.x, `${r.rn - r.rmiss.length}/${r.rn}`, r.candDone ? 'ครบ' : 'ยังไม่ครบ', r.recDone ? 'ครบ' : 'ยังไม่ครบ', r.both ? 'ครบ' : 'ยังไม่ครบ', STAGE_NAME[r.stage]]))

  if (!rows.length) return <div className="calm">ยังไม่มี Candidate</div>
  return (
    <>
      <div className="rtool">
        <select value={pick} aria-label="Recruiter" onChange={(e) => setPick(e.target.value)}>
          <option value="">ทุก Recruiter (เรียงตามงานค้างมากไปน้อย)</option>
          {names.map((k) => <option key={k} value={k}>{k} ({by[k].length})</option>)}
        </select>
        <button type="button" className="btn sm" onClick={() => saveBlob(new Blob([csv([head, ...lines])], { type: 'text/csv;charset=utf-8' }), `report-by-recruiter-${new Date().toISOString().slice(0, 10)}.csv`)}>Export CSV</button>
      </div>
      <div className="rcg">{shown.map((k) => <Card key={k + (pick ? ':one' : '')} name={k} list={by[k]} openAll={!!pick} />)}</div>
    </>
  )
}
