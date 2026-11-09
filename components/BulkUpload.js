'use client'
import { useRef, useState } from 'react'
import { guess, guessText } from '../lib/classify'
import { readText, stopOcr } from '../lib/readdoc'
import { nm } from '../lib/categories'

// Bulk upload: drop / pick many files -> system guesses the category (file name first, then the CONTENT of the file: PDF text, or OCR for scans / photos)
// -> user reviews -> confirm.
// cats: category rows for this page (candidate side or recruiter side)
// existing: { [code]: number of files already uploaded }
// onConfirm(assignments): assignments = [{ file, code }] for every file the user kept
export default function BulkUpload({ cats, existing = {}, onConfirm, busy }) {
  const [rows, setRows] = useState(null)
  const [over, setOver] = useState(false)
  const [ocr, setOcr] = useState(true)
  const [status, setStatus] = useState('')
  const inp = useRef(null), run = useRef(0)
  const allowed = new Set(cats.map((k) => k[0]))
  const label = (k) => (k[6] ? k[6] + ' ' : nm(k[0])) + k[1]
  const readable = (f) => /\.(pdf|jpe?g|png)$/i.test(f.name)

  const patch = (id, p) => setRows((r) => (r ? r.map((x) => (x.id === id ? { ...x, ...p } : x)) : r))
  function close() { run.current++; setStatus(''); setRows(null); stopOcr() }
  function stopReading() { run.current++; setStatus(''); setRows((r) => (r ? r.map((x) => ({ ...x, reading: false })) : r)); stopOcr() }

  // files whose name says nothing (e.g. scan001.pdf) are read: PDF text first, OCR if it is a scan
  async function analyze(list, id) {
    for (const r of list) {
      if (id !== run.current) return
      patch(r.id, { reading: true })
      const { text, via } = await readText(r.file, { ocr, onStatus: (t) => id === run.current && setStatus(t) })
      if (id !== run.current) return
      const g = guessText(text, allowed)
      setRows((rs) => (rs ? rs.map((x) => (x.id !== r.id ? x : { ...x, reading: false, via, ...(!x.touched && !x.code && g.code ? { code: g.code, sure: g.sure, by: 'content' } : {}) })) : rs))
    }
    if (id === run.current) setStatus('')
    stopOcr()
  }
  function pick(files) {
    const fl = [...files]
    if (!fl.length) return
    const id = ++run.current
    const list = fl.map((file, i) => ({ id: i, file, ...guess(file, allowed), skip: false, by: 'name', touched: false, reading: false }))
    setRows(list)
    const todo = list.filter((r) => !r.code && readable(r.file))
    if (todo.length) analyze(todo, id)
  }
  const set = (id, p) => patch(id, { ...p, ...(p.code !== undefined ? { sure: true, touched: true, by: 'user' } : {}) })
  const kept = (rows || []).filter((r) => !r.skip)
  const unset = kept.filter((r) => !r.code && !r.reading).length
  const reading = kept.some((r) => r.reading)
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
    close()
    await onConfirm(list)
  }
  const tagOf = (r) => {
    if (r.skip) return <span className="tag n">ข้าม</span>
    if (r.reading) return <span className="tag n">กำลังอ่านเนื้อหาไฟล์...</span>
    if (!r.code) return <span className="tag bad">เลือกหมวด</span>
    if (r.by === 'content') return <span className={'tag ' + (r.sure ? 'ok' : '')}>{r.sure ? 'จัดหมวดจากเนื้อหาไฟล์' : 'เดาจากเนื้อหา ตรวจดูอีกครั้ง'}</span>
    return <span className={'tag ' + (r.sure ? 'ok' : '')}>จัดหมวดแล้ว</span>
  }

  return (
    <>
      <div className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files) }}>
        <b>อัปโหลดหลายไฟล์พร้อมกัน</b>
        <div className="hint">ลากไฟล์มาวางที่นี่ หรือกดเลือกหลายไฟล์ ระบบเดาหมวดจากชื่อไฟล์ ถ้าชื่อไฟล์บอกไม่ได้ (เช่น scan001.pdf) จะอ่านเนื้อหาในไฟล์ให้ แล้วให้ตรวจก่อนยืนยันทุกครั้ง</div>
        <div className="ctl" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn pri" disabled={busy} onClick={() => inp.current.click()}>{busy ? 'กำลังอัปโหลด...' : 'เลือกหลายไฟล์'}</button>
        </div>
        <label className="chk2" style={{ marginTop: 8 }}><input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} /> อ่านไฟล์สแกนและรูปด้วย OCR (ครั้งแรกโหลดข้อมูลภาษาประมาณ 10 MB)</label>
        <input ref={inp} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
      </div>
      {rows && (
        <div className="overlay" onClick={close}>
          <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }} onClick={(e) => e.stopPropagation()}>
            <b style={{ fontSize: 17 }}>ตรวจหมวดเอกสารก่อนอัปโหลด</b>
            <div className="hint">แก้หมวดได้ที่ช่องเลือก ไฟล์ที่ระบบเดาไม่ได้ต้องเลือกหมวดเอง หรือกด "ข้าม"</div>
            {reading && (
              <div className="hint" style={{ color: 'var(--warn)' }}>กำลังอ่านเนื้อหาไฟล์ที่ชื่อไม่บอกหมวด {status && '· ' + status} <button type="button" className="btn sm" onClick={stopReading}>หยุดอ่าน แล้วเลือกเอง</button></div>
            )}
            <ul className="files">
              {rows.map((r) => (
                <li key={r.id} style={{ opacity: r.skip ? 0.45 : 1 }}>
                  <div className="fl"><span>{r.file.name}</span>{tagOf(r)}</div>
                  <div className="ctl">
                    <select value={r.code} disabled={r.skip} onChange={(e) => set(r.id, { code: e.target.value })}>
                      <option value="">— เลือกหมวด —</option>
                      {cats.map((k) => <option key={k[0]} value={k[0]}>{label(k)} ({k[2]})</option>)}
                    </select>
                    <button type="button" className="btn sm" onClick={() => set(r.id, { skip: !r.skip })}>{r.skip ? 'ไม่ข้าม' : 'ข้าม'}</button>
                  </div>
                  {!r.skip && warn(r) && <div className="hint" style={{ color: 'var(--warn)' }}>{warn(r)}</div>}
                  {!r.skip && !r.reading && !r.code && r.via === 'none' && readable(r.file) && <div className="hint">อ่านเนื้อหาไฟล์ไม่ได้ (ไฟล์อาจเป็นรูปที่ไม่ชัด หรือปิด OCR ไว้) กรุณาเลือกหมวดเอง</div>}
                </li>
              ))}
            </ul>
            <div className="ctl" style={{ marginTop: 12 }}>
              <button type="button" className="btn pri" disabled={!kept.length || unset > 0 || reading} onClick={go}>{reading ? 'กำลังอ่านเนื้อหาไฟล์...' : `อัปโหลด ${kept.length} ไฟล์`}</button>
              <button type="button" className="btn" onClick={close}>ยกเลิก</button>
              {unset > 0 && <span className="err">ยังไม่ได้เลือกหมวด {unset} ไฟล์</span>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
