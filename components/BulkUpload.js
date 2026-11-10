'use client'
import { useRef, useState } from 'react'
import { guess, guessText } from '../lib/classify'
import { readText, readPdfPages, stopOcr } from '../lib/readdoc'
import { segmentPages, parseRanges, fmtRange, cutPdf } from '../lib/splitpdf'
import { nm } from '../lib/categories'

// Bulk upload: drop / pick many files -> the system guesses the category (file name first, then the CONTENT: PDF text, or OCR for scans / photos)
// -> if ONE PDF holds several documents (ID card + house registration + transcript ...) it is split page by page into separate files
// -> the person reviews everything -> confirm.
// cats: category rows for this page (candidate side or recruiter side)
// existing: { [code]: number of files already uploaded }
// onConfirm(assignments): assignments = [{ file, code }] for every file (or split part) the person kept
// compact: smaller drop zone for the top of the Candidate page
export default function BulkUpload({ cats, existing = {}, onConfirm, busy, compact }) {
  const [rows, setRows] = useState(null)
  const [over, setOver] = useState(false)
  const [ocr, setOcr] = useState(true)
  const [status, setStatus] = useState('')
  const [making, setMaking] = useState(false)
  const inp = useRef(null), run = useRef(0), pid = useRef(1)
  const allowed = new Set(cats.map((k) => k[0]))
  const label = (k) => (k[6] ? k[6] + ' ' : nm(k[0])) + k[1]
  const readable = (f) => /\.(pdf|jpe?g|png)$/i.test(f.name)
  const isPdf = (f) => /\.pdf$/i.test(f.name)

  const patch = (id, p) => setRows((r) => (r ? r.map((x) => (x.id === id ? { ...x, ...p } : x)) : r))
  function close() { run.current++; setStatus(''); setRows(null); stopOcr() }
  function stopReading() { run.current++; setStatus(''); setRows((r) => (r ? r.map((x) => ({ ...x, reading: false })) : r)); stopOcr() }
  const mkParts = (segs) => segs.map((s) => ({ pid: pid.current++, range: fmtRange(s.from, s.to), code: s.code || '', sure: !!s.sure, skip: false }))

  // read files: PDFs page by page (split when several documents are found), photos / single pages as before
  // force = the person pressed "แยกหน้า" on a file the system had already named
  async function analyze(list, id, force) {
    for (const r of list) {
      if (id !== run.current) return
      patch(r.id, { reading: true })
      const stop = () => id !== run.current, onStatus = (t) => id === run.current && setStatus(t)
      if (isPdf(r.file)) {
        const pr = await readPdfPages(r.file, { ocr, onStatus, shouldStop: stop })
        if (id !== run.current) return
        if (pr && pr.pages.length) {
          const segs = segmentPages(pr.pages, allowed), whole = guessText(pr.pages.slice(0, 3).map((x) => x.text).join(' '), allowed)
          const via = pr.pages.some((x) => x.via === 'ocr') ? 'ocr' : pr.pages.some((x) => x.via === 'text') ? 'text' : 'none'
          if (pr.n >= 2 && (segs.length >= 2 || force)) {
            const parts = mkParts(segs.length ? segs : [{ from: 1, to: pr.n, code: '', sure: false }])
            patch(r.id, { reading: false, via, n: pr.n, split: true, parts, partial: pr.n > pr.pages.length })
          } else {
            setRows((rs) => (rs ? rs.map((x) => (x.id !== r.id ? x : { ...x, reading: false, via, n: pr.n, ...(!x.touched && !x.code && whole.code ? { code: whole.code, sure: whole.sure, by: 'content' } : {}) })) : rs))
          }
          continue
        }
      }
      const { text, via } = await readText(r.file, { ocr, onStatus })
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
    const list = fl.map((file, i) => ({ id: i, file, ...guess(file, allowed), skip: false, by: 'name', touched: false, reading: false, split: false, parts: null, n: 0 }))
    setRows(list)
    const todo = list.filter((r) => !r.code && readable(r.file))
    if (todo.length) analyze(todo, id)
  }
  const set = (id, p) => patch(id, { ...p, ...(p.code !== undefined ? { sure: true, touched: true, by: 'user' } : {}) })
  const setPart = (rid, pidv, p) => setRows((rs) => rs.map((x) => (x.id !== rid ? x : { ...x, parts: x.parts.map((q) => (q.pid === pidv ? { ...q, ...p, ...(p.code !== undefined ? { sure: true } : {}) } : q)) })))
  const mergeUp = (rid, i) => setRows((rs) => rs.map((x) => {
    if (x.id !== rid || i < 1) return x
    const a = x.parts[i - 1], b = x.parts[i]
    return { ...x, parts: [...x.parts.slice(0, i - 1), { ...a, range: a.range + ',' + b.range, code: a.code || b.code }, ...x.parts.slice(i + 1)] }
  }))
  const addPart = (rid) => setRows((rs) => rs.map((x) => (x.id !== rid ? x : { ...x, parts: [...x.parts, { pid: pid.current++, range: '', code: '', sure: false, skip: false }] })))
  function splitNow(r) {
    const id = ++run.current
    analyze([r], id, true)
  }

  // everything that will be uploaded: whole files, or the parts of a split file
  const items = []
  ;(rows || []).forEach((r) => {
    if (r.skip) return
    if (r.split && r.parts) r.parts.forEach((q) => { if (!q.skip) items.push({ key: r.id + ':' + q.pid, r, q, code: q.code, bad: !parseRanges(q.range, r.n) }) })
    else items.push({ key: r.id, r, code: r.code, bad: false })
  })
  const unset = items.filter((x) => !x.code && !x.r.reading).length
  const badRange = items.filter((x) => x.q && x.bad).length
  const reading = (rows || []).some((r) => !r.skip && r.reading)
  // categories that take several files: no warning when two files go there
  const multi = (code) => code === 'OT' || code === 'ROT' || code === 'PS' || code === '2.4'
  const count = {}
  items.forEach((x) => { if (x.code) count[x.code] = (count[x.code] || 0) + 1 })
  const warn = (code) => {
    if (!code || multi(code)) return ''
    if (count[code] > 1) return 'มีหลายไฟล์ในหมวดนี้'
    if (existing[code]) return 'หมวดนี้มีไฟล์อยู่แล้ว (ไฟล์ใหม่จะเพิ่มเข้าไปหรือแทนที่)'
    return ''
  }
  async function go() {
    setMaking(true)
    try {
      const list = []
      for (const r of rows) {
        if (r.skip) continue
        if (r.split && r.parts) {
          const base = r.file.name.replace(/\.[^.]+$/, '')
          for (const q of r.parts) {
            if (q.skip) continue
            const idx = parseRanges(q.range, r.n)
            if (!idx) continue
            list.push({ file: idx.length === r.n ? r.file : await cutPdf(r.file, idx, base + ' (หน้า ' + q.range.replace(/\s/g, '') + ').pdf'), code: q.code })
          }
        } else list.push({ file: r.file, code: r.code })
      }
      close()
      await onConfirm(list)
    } finally { setMaking(false) }
  }
  const tagOf = (r) => {
    if (r.skip) return <span className="tag n">ข้าม</span>
    if (r.reading) return <span className="tag n">กำลังอ่านเนื้อหาไฟล์...</span>
    if (!r.code) return <span className="tag bad">เลือกหมวด</span>
    if (r.by === 'content') return <span className={'tag ' + (r.sure ? 'ok' : '')}>{r.sure ? 'จัดหมวดจากเนื้อหาไฟล์' : 'เดาจากเนื้อหา ตรวจดูอีกครั้ง'}</span>
    return <span className={'tag ' + (r.sure ? 'ok' : '')}>จัดหมวดแล้ว</span>
  }
  const sel = (value, onChange, disabled) => (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">— เลือกหมวด —</option>
      {cats.map((k) => <option key={k[0]} value={k[0]}>{label(k)} ({k[2]})</option>)}
    </select>
  )

  return (
    <>
      <div className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files) }}>
        <div className="t">
          <b>อัปโหลดหลายไฟล์พร้อมกัน</b>
          <div className="hint">ลากไฟล์มาวาง หรือกดเลือกหลายไฟล์ ระบบจัดหมวดให้จากชื่อไฟล์และเนื้อหา ถ้ารวมทุกเอกสารไว้ใน PDF ไฟล์เดียว ระบบจะแยกหน้าเป็นแต่ละเอกสารให้ แล้วให้ตรวจก่อนยืนยันทุกครั้ง</div>
          {!compact && <label className="chk2" style={{ marginTop: 8 }}><input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} /> อ่านไฟล์สแกนและรูปด้วย OCR (ครั้งแรกโหลดข้อมูลภาษาประมาณ 10 MB)</label>}
        </div>
        <div className="ctl" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn pri" disabled={busy} onClick={() => inp.current.click()}>{busy ? 'กำลังอัปโหลด...' : 'เลือกหลายไฟล์'}</button>
        </div>
        {compact && <label className="chk2" style={{ flexBasis: '100%' }}><input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} /> อ่านไฟล์สแกนและรูปด้วย OCR (ครั้งแรกโหลดข้อมูลภาษาประมาณ 10 MB)</label>}
        <input ref={inp} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
      </div>
      {rows && (
        <div className="overlay" onClick={close}>
          <div className="panel" style={{ maxWidth: 800, margin: '24px auto' }} onClick={(e) => e.stopPropagation()}>
            <b style={{ fontSize: 17 }}>ตรวจหมวดเอกสารก่อนอัปโหลด</b>
            <div className="hint">แก้หมวดได้ที่ช่องเลือก ไฟล์ที่ระบบเดาไม่ได้ต้องเลือกหมวดเอง หรือกด "ข้าม"</div>
            {reading && (
              <div className="hint" style={{ color: 'var(--warn)' }}>กำลังอ่านเนื้อหาไฟล์ {status && '· ' + status} <button type="button" className="btn sm" onClick={stopReading}>หยุดอ่าน แล้วเลือกเอง</button></div>
            )}
            <ul className="files">
              {rows.map((r) => (
                <li key={r.id} style={{ opacity: r.skip ? 0.45 : 1 }}>
                  <div className="fl"><span>{r.file.name}{r.n > 1 && <span className="sub"> · {r.n} หน้า</span>}</span>{r.split && !r.skip ? <span className="tag ok">แยกเป็น {r.parts.filter((q) => !q.skip).length} ไฟล์</span> : tagOf(r)}</div>
                  {r.split && !r.skip ? (
                    <div className="sp">
                      <div className="hint" style={{ margin: 0 }}>ไฟล์นี้มีหลายเอกสารรวมกัน ระบบแยกหน้าให้แล้ว แก้ช่วงหน้าได้ เช่น 1-2 หรือ 1,3{r.partial ? ' (อ่านเฉพาะ 40 หน้าแรกเพื่อแยกอัตโนมัติ)' : ''}</div>
                      {r.parts.map((q, i) => {
                        const bad = !q.skip && !parseRanges(q.range, r.n)
                        return (
                          <div key={q.pid} className="pr" style={{ opacity: q.skip ? 0.45 : 1 }}>
                            <span className="pn">หน้า</span>
                            <input type="text" aria-label="ช่วงหน้า" value={q.range} disabled={q.skip} style={bad ? { borderColor: 'var(--bad)' } : undefined} onChange={(e) => setPart(r.id, q.pid, { range: e.target.value })} />
                            {sel(q.code, (v) => setPart(r.id, q.pid, { code: v }), q.skip)}
                            <button type="button" className="btn sm" onClick={() => setPart(r.id, q.pid, { skip: !q.skip })}>{q.skip ? 'ไม่ข้าม' : 'ข้าม'}</button>
                            {i > 0 ? <button type="button" className="btn sm" title="รวมหน้าชุดนี้เข้ากับชุดก่อนหน้า" onClick={() => mergeUp(r.id, i)}>รวมกับบน</button> : <span />}
                            {!q.skip && warn(q.code) && <div className="hint" style={{ gridColumn: '1/-1', color: 'var(--warn)', margin: 0 }}>{warn(q.code)}</div>}
                            {bad && <div className="hint" style={{ gridColumn: '1/-1', color: 'var(--bad)', margin: 0 }}>ช่วงหน้าไม่ถูกต้อง (ไฟล์นี้มี {r.n} หน้า)</div>}
                          </div>
                        )
                      })}
                      <div className="ctl"><button type="button" className="btn sm" onClick={() => addPart(r.id)}>+ เพิ่มชุดหน้า</button><button type="button" className="btn sm" onClick={() => patch(r.id, { split: false })}>ไม่แยก ส่งเป็นไฟล์เดียว</button><button type="button" className="btn sm" onClick={() => set(r.id, { skip: true })}>ข้ามทั้งไฟล์</button></div>
                    </div>
                  ) : (
                    <>
                      <div className="ctl">
                        {sel(r.code, (v) => set(r.id, { code: v }), r.skip)}
                        <button type="button" className="btn sm" onClick={() => set(r.id, { skip: !r.skip })}>{r.skip ? 'ไม่ข้าม' : 'ข้าม'}</button>
                        {isPdf(r.file) && !r.skip && !r.reading && <button type="button" className="btn sm" title="ใช้เมื่อไฟล์นี้รวมหลายเอกสารไว้ด้วยกัน" onClick={() => splitNow(r)}>แยกหน้า</button>}
                      </div>
                      {!r.skip && warn(r.code) && <div className="hint" style={{ color: 'var(--warn)' }}>{warn(r.code)}</div>}
                      {!r.skip && !r.reading && !r.code && r.via === 'none' && readable(r.file) && <div className="hint">อ่านเนื้อหาไฟล์ไม่ได้ (ไฟล์อาจเป็นรูปที่ไม่ชัด หรือปิด OCR ไว้) กรุณาเลือกหมวดเอง</div>}
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="ctl" style={{ marginTop: 12 }}>
              <button type="button" className="btn pri" disabled={!items.length || unset > 0 || badRange > 0 || reading || making} onClick={go}>{making ? 'กำลังเตรียมไฟล์...' : reading ? 'กำลังอ่านเนื้อหาไฟล์...' : `อัปโหลด ${items.length} ไฟล์`}</button>
              <button type="button" className="btn" onClick={close}>ยกเลิก</button>
              {unset > 0 && <span className="err">ยังไม่ได้เลือกหมวด {unset} ไฟล์</span>}
              {badRange > 0 && <span className="err">ช่วงหน้าไม่ถูกต้อง {badRange} ชุด</span>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
