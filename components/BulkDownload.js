'use client'
import { useState } from 'react'
import { base } from '../lib/categories'
import { filterRows } from '../lib/rows'
import { eligible, addFiles, zipName, zipCandidate, saveBlob, JSZip } from '../lib/zipper'
import SearchFilter from './SearchFilter'
import Avatar from './Avatar'

// Bulk download: search / filter, tick candidates, download one combined Zip (a folder per candidate) or one Zip each
export default function BulkDownload({ rows, docs, positions, photos }) {
  const [f, setF] = useState({ q: '', pos: '', st: 'all' })
  const [sel, setSel] = useState({})
  const [scope, setScope] = useState('verified')
  const [withR, setWithR] = useState(true)
  const [mode, setMode] = useState('one')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const list = filterRows(rows, f)
  const chosen = list.filter((r) => sel[r.c.id])
  const all = list.length > 0 && list.every((r) => sel[r.c.id])
  const files = (r) => eligible(r.c, docs, scope, withR)

  async function run() {
    const todo = chosen.map((r) => [r.c, files(r)]).filter(([, l]) => l.length)
    if (!todo.length) { setMsg('ไม่มีไฟล์ที่เข้าเงื่อนไขในคนที่เลือก'); return }
    setBusy(true)
    try {
      if (mode === 'one') {
        const z = new JSZip()
        for (let i = 0; i < todo.length; i++) { setMsg(`กำลังรวมไฟล์ ${i + 1}/${todo.length}: ${base(todo[i][0])}`); await addFiles(z, todo[i][0], todo[i][1], zipName(todo[i][0])) }
        saveBlob(await z.generateAsync({ type: 'blob' }), `Documents ${new Date().toISOString().slice(0, 10)}.zip`)
      } else {
        for (let i = 0; i < todo.length; i++) { setMsg(`กำลังรวมไฟล์ ${i + 1}/${todo.length}: ${base(todo[i][0])}`); saveBlob(await zipCandidate(todo[i][0], todo[i][1]), zipName(todo[i][0]) + '.zip') }
      }
      setMsg('')
    } catch { setMsg('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง') }
    setBusy(false)
  }
  return (
    <>
      <SearchFilter f={f} setF={setF} positions={positions} />
      <div className="panel">
        <div className="ctl" style={{ marginTop: 0 }}>
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="ขอบเขตไฟล์">
            <option value="verified">เฉพาะ Verified (ตรวจผ่าน)</option><option value="all">ทุกไฟล์ที่อัปโหลด</option>
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="รูปแบบ">
            <option value="one">รวม Zip เดียว (แยกโฟลเดอร์ต่อคน)</option><option value="each">แยก Zip ต่อคน</option>
          </select>
          <label className="chk2"><input type="checkbox" checked={withR} onChange={(e) => setWithR(e.target.checked)} /> รวมเอกสารฝั่ง Recruiter</label>
          <button type="button" className="btn pri" disabled={busy || !chosen.length} onClick={run}>{busy ? 'กำลังทำงาน...' : `ดาวน์โหลด (${chosen.length} คน)`}</button>
        </div>
        {msg && <div className="hint" style={{ marginTop: 8 }}>{msg}</div>}
        <div className="hint">บัตรประชาชนจะรวมให้เมื่อ HR ตรวจไฟล์สุดท้ายแล้วเท่านั้น · ถ้าเลือกแยก Zip ต่อคน บราวเซอร์อาจขอสิทธิ์ดาวน์โหลดหลายไฟล์</div>
        <div className="scroll"><table className="tbl">
          <thead><tr><th><input type="checkbox" checked={all} aria-label="เลือกทั้งหมด" onChange={(e) => setSel(Object.fromEntries(list.map((r) => [r.c.id, e.target.checked])))} /></th><th>ผู้สมัคร</th><th>SRF</th><th>ตำแหน่ง</th><th>ไฟล์ที่โหลดได้</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.c.id}>
                <td><input type="checkbox" checked={!!sel[r.c.id]} aria-label={'เลือก ' + base(r.c)} onChange={(e) => setSel({ ...sel, [r.c.id]: e.target.checked })} /></td>
                <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Avatar url={photos[r.c.id]} name={r.c.first_name ? base(r.c) : ''} size={32} />{r.c.first_name ? base(r.c) : r.c.email}</div></td>
                <td>{r.c.srf_no}</td><td>{r.c.position}</td><td>{files(r).length} ไฟล์</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="5" className="mute">ไม่พบ Candidate ตามเงื่อนไข</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  )
}
