'use client'
import { req, nm, RCATS, rreqd, okR, fdt } from '../lib/categories'
import { DS, catStatus } from '../lib/status'
import { base } from '../lib/categories'
import { saveBlob } from '../lib/zipper'

// Reports: status by document type, by position, per candidate (+ CSV export)
const csv = (rows) => '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')

export default function Reports({ rows }) {
  // status matrix: for each document type, how many candidates are in each status (only candidates who need that type)
  const types = {}
  rows.forEach((r) => req(r.c).forEach((k) => {
    const t = (types[k[0]] = types[k[0]] || { k, missing: 0, received: 0, pending: 0, verified: 0, revision: 0 })
    if (k[5] && !r.m.some((d) => d.category === k[0])) return          // optional + not sent: not counted
    t[catStatus(r.m.filter((d) => d.category === k[0]))]++
  }))
  const byPos = {}
  rows.forEach((r) => {
    const p = (byPos[r.c.position] = byPos[r.c.position] || { n: 0, done: 0, cd: 0, rd: 0, sent: 0, need: 0 })
    p.n++; if (r.both) p.done++; if (r.candDone) p.cd++; if (r.recDone) p.rd++; p.sent += r.n - r.miss.length; p.need += r.n
  })
  const pct = (r) => (r.n ? Math.round(((r.n - r.miss.length) / r.n) * 100) : 0)
  const head = ['ชื่อ', 'อีเมล', 'SRF', 'ตำแหน่ง', 'ส่งเอกสารบังคับ', 'ขาดเอกสารบังคับ', 'Received', 'Pending', 'Verified', 'Revision Required', 'แคนดิเดตครบ (Verified)', 'Recruiter ครบ', 'ครบทั้งสองฝั่ง', 'ขั้นตอน']
  const lines = rows.map((r) => [base(r.c), r.c.email, r.c.srf_no, r.c.position, `${r.n - r.miss.length}/${r.n}`, r.miss.map((k) => nm(k[0]) + k[1]).join(' | '), r.rc, r.pd, r.m.filter((d) => d.status === 'ok').length, r.x, `${r.rn - r.rmiss.length}/${r.rn}`, r.candDone ? 'ครบ' : 'ยังไม่ครบ', r.recDone ? 'ครบ' : 'ยังไม่ครบ', r.both ? 'ครบ' : 'ยังไม่ครบ', r.stage])
  const total = rows.length, done = rows.filter((r) => r.both).length, cdone = rows.filter((r) => r.candDone).length, rdone = rows.filter((r) => r.recDone).length
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="sub">ผู้สมัครทั้งหมด</span><b>{total}</b></div>
        <div className="kpi"><span className="sub">เอกสารฝั่งแคนดิเดตครบ</span><b>{cdone}</b></div>
        <div className="kpi"><span className="sub">เอกสารฝั่ง Recruiter ครบ</span><b>{rdone}</b></div>
        <div className="kpi"><span className="sub">ครบทั้งสองฝั่ง</span><b>{done}</b></div>
        <div className="kpi"><span className="sub">มีไฟล์ Revision Required</span><b>{rows.filter((r) => r.x).length}</b></div>
        <div className="kpi"><span className="sub">ยังขาดเอกสารบังคับ</span><b>{rows.filter((r) => r.miss.length).length}</b></div>
      </div>
      <div className="panel">
        <b>สถานะเอกสารแยกตามประเภท</b><div className="hint">นับจำนวนแคนดิเดตในแต่ละสถานะ (เอกสารไม่บังคับที่ยังไม่ส่งไม่นับ)</div>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>เอกสาร</th>{Object.keys(DS).map((s) => <th key={s}>{DS[s][0]}</th>)}</tr></thead>
          <tbody>{Object.values(types).sort((a, b) => (a.k[0] > b.k[0] ? 1 : -1)).map((t) => (
            <tr key={t.k[0]}><td>{nm(t.k[0])}{t.k[1]}</td>{Object.keys(DS).map((s) => <td key={s}>{t[s] ? <span className={'tag ' + DS[s][2]}>{t[s]}</span> : <span className="mute">0</span>}</td>)}</tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="panel">
        <b>เอกสารฝั่ง Recruiter</b>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>เอกสาร</th><th>ส่งแล้ว</th><th>ยังไม่ครบ (บังคับ)</th></tr></thead>
          <tbody>{RCATS.map((k) => {
            const need = rows.filter((r) => rreqd(r.c).some((x) => x[0] === k[0])), have = rows.filter((r) => r.mr.some((d) => d.category === k[0]))
            return <tr key={k[0]}><td>{k[6] ? k[6] + ' ' : ''}{k[1]}</td><td>{have.length}/{total}</td><td>{k[5] ? <span className="mute">ไม่บังคับ</span> : need.filter((r) => !okR(r.mr, r.c, k)).length}</td></tr>
          })}</tbody>
        </table></div>
      </div>
      <div className="panel">
        <b>แยกตามตำแหน่ง</b>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>ตำแหน่ง</th><th>ผู้สมัคร</th><th>ฝั่งแคนดิเดตครบ</th><th>ฝั่ง Recruiter ครบ</th><th>ครบทั้งสองฝั่ง</th><th>ความคืบหน้าเอกสารบังคับ</th></tr></thead>
          <tbody>{Object.entries(byPos).map(([p, v]) => <tr key={p}><td>{p}</td><td>{v.n}</td><td>{v.cd}</td><td>{v.rd}</td><td>{v.done}</td><td style={{ minWidth: 140 }}><div className="bar"><i style={{ width: (v.need ? (v.sent / v.need) * 100 : 0) + '%' }} /></div>{v.need ? Math.round((v.sent / v.need) * 100) : 0}%</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="panel">
        <div className="fl"><b>รายคน</b><button type="button" className="btn sm" onClick={() => saveBlob(new Blob([csv([head, ...lines])], { type: 'text/csv;charset=utf-8' }), `report-${new Date().toISOString().slice(0, 10)}.csv`)}>Export CSV</button></div>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>ชื่อ</th><th>SRF</th><th>ตำแหน่ง</th><th>เอกสารบังคับ</th><th>Received</th><th>Pending</th><th>Revision</th><th>แคนดิเดต</th><th>Recruiter</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.c.id}><td>{r.c.first_name ? base(r.c) : r.c.email}</td><td>{r.c.srf_no}</td><td>{r.c.position}</td><td>{pct(r)}% ({r.n - r.miss.length}/{r.n})</td><td>{r.rc}</td><td>{r.pd}</td><td>{r.x ? <span className="tag bad">{r.x}</span> : 0}</td><td>{r.candDone ? <span className="tag ok">ครบ</span> : <span className="tag g">ยังไม่ครบ</span>}</td><td>{r.recDone ? <span className="tag ok">ครบ ({r.rn}/{r.rn})</span> : <span className="tag">{r.rn - r.rmiss.length}/{r.rn}</span>}</td></tr>)}</tbody>
        </table></div>
      </div>
    </>
  )
}
