'use client'
import { useRef, useState } from 'react'
import { guess } from '../lib/classify'
import { nm } from '../lib/categories'

// Bulk upload: drop / pick many files -> system guesses the category from the file name -> user reviews -> confirm.
// cats: category rows for this page (candidate side or recruiter side)
// existing: { [code]: number of files already uploaded }
// onConfirm(assignments): assignments = [{ file, code }] for every file the user kept
export default function BulkUpload({ cats, existing = {}, onConfirm, busy }) {
  const [rows, setRows] = useState(null)
  const [over, setOver] = useState(false)
  const inp = useRef(null)
  const allowed = new Set(cats.map((k) => k[0]))
  const label = (k) => (k[6] ? k[6] + ' ' : nm(k[0])) + k[1]

  function pick(files) {
    const fl = [...files]
    if (!fl.length) return
    setRows(fl.map((file, i) => ({ id: i, file, ...guess(file, allowed), skip: false })))
  }
  const set = (id, p) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p, sure: p.code !== undefined ? true : x.sure } : x)))
  const kept = (rows || []).filter((r) => !r.skip)
  const unset = kept.filter((r) => !r.code).length
  // categories that take one file only: warn when two files go there or one is already uploaded
  const multi = (code) => code === 'OT' || code === 'ROT' || code === 'PS' || code === '2.4'
  const count = {}
  kept.forEach((r) => { if (r.code) count[r.code] = (count[r.code] || 0) + 1 })
  const warn = (r) => {
    if (!r.code || multi(r.code)) return ''
    if (count[r.code] > 1) return 'มีหลายไฟล์ในหมวดนี้'
    if (existing[r.code]) return 'หมวดนี้มีไฟล์อยู่แล้ว (ไฟล์ใหม่จะเพิ่มเข้าไปหรือแทนที่)'
    return ''
  }
  async function go() {
    const list = kept.map((r) => ({ file: r.file, code: r.code }))
    setRows(null)
    await onConfirm(list)
  }

  return (
    <>
      <div className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files) }}>
        <b>อัปโหลดหลายไฟล์พร้อมกัน</b>
        <div className="hint">ลากไฟล์มาวางที่นี่ หรือกดเลือกหลายไฟล์ ระบบจะเดาหมวดจากชื่อไฟล์ให้ แล้วให้ตรวจก่อนยืนยันทุกครั้ง</div>
        <div className="ctl" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn pri" disabled={busy} onClick={() => inp.current.click()}>{busy ? 'กำลังอัปโหลด...' : 'เลือกหลายไฟล์'}</button>
        </div>
        <input ref={inp} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
      </div>
      {rows && (
        <div className="overlay" onClick={() => setRows(null)}>
          <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }} onClick={(e) => e.stopPropagation()}>
            <b style={{ fontSize: 17 }}>ตรวจหมวดเอกสารก่อนอัปโหลด</b>
            <div className="hint">แก้หมวดได้ที่ช่องเลือก ไฟล์ที่ระบบเดาไม่ได้ต้องเลือกหมวดเอง หรือกด "ข้าม"</div>
            <ul className="files">
              {rows.map((r) => (
                <li key={r.id} style={{ opacity: r.skip ? 0.45 : 1 }}>
                  <div className="fl"><span>{r.file.name}</span>
                    {r.skip ? <span className="tag n">ข้าม</span> : r.code ? <span className={'tag ' + (r.sure ? 'ok' : '')}>จัดหมวดแล้ว</span> : <span className="tag bad">เลือกหมวด</span>}
                  </div>
                  <div className="ctl">
                    <select value={r.code} disabled={r.skip} onChange={(e) => set(r.id, { code: e.target.value })}>
                      <option value="">— เลือกหมวด —</option>
                      {cats.map((k) => <option key={k[0]} value={k[0]}>{label(k)} ({k[2]})</option>)}
                    </select>
                    <button type="button" className="btn sm" onClick={() => set(r.id, { skip: !r.skip })}>{r.skip ? 'ไม่ข้าม' : 'ข้าม'}</button>
                  </div>
                  {!r.skip && warn(r) && <div className="hint" style={{ color: 'var(--warn)' }}>{warn(r)}</div>}
                </li>
              ))}
            </ul>
            <div className="ctl" style={{ marginTop: 12 }}>
              <button type="button" className="btn pri" disabled={!kept.length || unset > 0} onClick={go}>อัปโหลด {kept.length} ไฟล์</button>
              <button type="button" className="btn" onClick={() => setRows(null)}>ยกเลิก</button>
              {unset > 0 && <span className="err">ยังไม่ได้เลือกหมวด {unset} ไฟล์</span>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
