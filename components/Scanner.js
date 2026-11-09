'use client'
import { useEffect, useRef, useState } from 'react'
import { loadImg } from '../lib/images'
import { fitCanvas, rotateCanvas, rotateQuad, detectQuad, warp, applyFilter, canvasBlob } from '../lib/scan'

// Take photos of a document (phone camera) or pick pictures, drag the 4 corners to crop, clean up, add more pages.
// onDone(blobs) gives one JPEG blob per page (b.w / b.h set); the caller decides PDF or image.
const FILTERS = [['color', 'สีตามจริง'], ['gray', 'ขาวดำเทา คมชัด'], ['bw', 'สแกน พื้นขาว']]

export default function Scanner({ onDone, onCancel, maxPages = 10, title = 'ถ่ายรูป / สแกนเอกสาร' }) {
  const [pages, setPages] = useState([])   // { id, src (canvas), quad, filter, thumb }
  const [cur, setCur] = useState(0)
  const [view, setView] = useState('edit') // edit = adjust the frame · result = preview of the clean page
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const edit = useRef(null), res = useRef(null), drag = useRef(null)
  const cam = useRef(null), alb = useRef(null), nid = useRef(1)
  const pg = pages[cur]

  const thumbOf = (cv) => fitCanvas(cv, 120).toDataURL('image/jpeg', 0.6)
  const patch = (i, p) => setPages((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)))

  async function add(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name))
    if (!list.length) return
    setBusy('กำลังเตรียมรูป...'); setMsg('')
    const out = []
    try {
      for (const f of list.slice(0, Math.max(0, maxPages - pages.length))) {
        const src = fitCanvas(await loadImg(f), 2400)
        out.push({ id: nid.current++, src, quad: detectQuad(src), filter: 'color', thumb: thumbOf(src) })
      }
      if (list.length > maxPages - pages.length) setMsg(`เพิ่มได้สูงสุด ${maxPages} หน้า`)
    } catch { setMsg('เปิดรูปนี้ไม่ได้ (บางเครื่องถ่ายเป็น HEIC ให้ตั้งกล้องเป็น JPG หรือเลือกรูปอื่น)') }
    if (out.length) { setPages((a) => [...a, ...out]); setCur(pages.length); setView('edit') }
    setBusy('')
  }

  // ---- edit view: image + draggable corners ----
  const rad = () => { const c = edit.current; return c ? Math.max(14, c.width / 38) : 14 }
  function paint() {
    const cv = edit.current; if (!cv || !pg) return
    const s = pg.src, g = cv.getContext('2d')
    if (cv.width !== s.width || cv.height !== s.height) { cv.width = s.width; cv.height = s.height }
    g.drawImage(s, 0, 0)
    const q = pg.quad.map(([x, y]) => [x * s.width, y * s.height])
    g.save(); g.fillStyle = 'rgba(0,0,0,.45)'
    g.beginPath(); g.rect(0, 0, s.width, s.height); g.moveTo(q[0][0], q[0][1]); for (let i = 3; i >= 0; i--) g.lineTo(q[i][0], q[i][1]); g.closePath(); g.fill('evenodd'); g.restore()
    g.lineWidth = Math.max(3, s.width / 400); g.strokeStyle = '#ffc72c'; g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke()
    q.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], rad(), 0, 7); g.fillStyle = '#ffc72c'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#2a2118'; g.stroke() })
  }
  const pt = (e) => { const cv = edit.current, b = cv.getBoundingClientRect(); return [((e.clientX - b.left) * cv.width) / b.width, ((e.clientY - b.top) * cv.height) / b.height] }
  function down(e) {
    if (!pg) return
    const p = pt(e), s = pg.src
    let best = -1, bd = rad() * 3
    pg.quad.forEach(([x, y], i) => { const d = Math.hypot(x * s.width - p[0], y * s.height - p[1]); if (d < bd) { bd = d; best = i } })
    if (best < 0) return
    drag.current = best; e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e) {
    if (drag.current === null || !pg) return
    const p = pt(e), s = pg.src, q = pg.quad.map((x) => [...x])
    q[drag.current] = [Math.max(0, Math.min(1, p[0] / s.width)), Math.max(0, Math.min(1, p[1] / s.height))]
    patch(cur, { quad: q })
  }
  const up = () => { drag.current = null }
  useEffect(() => { if (view === 'edit') paint() }) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- result view: preview of the cropped + cleaned page ----
  useEffect(() => {
    if (view !== 'result' || !pg || !res.current) return
    const out = applyFilter(warp(pg.src, pg.quad, 900), pg.filter), cv = res.current
    cv.width = out.width; cv.height = out.height; cv.getContext('2d').drawImage(out, 0, 0)
  }, [view, cur, pg?.filter, pg?.quad]) // eslint-disable-line react-hooks/exhaustive-deps

  function rotate(dir) {
    const src = rotateCanvas(pg.src, dir)
    patch(cur, { src, quad: rotateQuad(pg.quad, dir), thumb: thumbOf(src) })
  }
  function remove() {
    const next = pages.filter((_, i) => i !== cur)
    setPages(next); setCur(Math.max(0, Math.min(cur, next.length - 1))); setView('edit')
  }
  async function finish() {
    setBusy('กำลังสร้างไฟล์...'); setMsg('')
    try {
      const blobs = []
      for (const p of pages) {
        await new Promise((r) => setTimeout(r, 0)) // let the UI breathe between pages
        blobs.push(await canvasBlob(applyFilter(warp(p.src, p.quad, 1700), p.filter)))
      }
      onDone(blobs)
    } catch { setMsg('สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง'); setBusy('') }
  }

  const pick = (ref) => (
    <input ref={ref} type="file" hidden accept="image/*" multiple={ref === alb} {...(ref === cam ? { capture: 'environment' } : {})}
      onChange={(e) => { add(e.target.files); e.target.value = '' }} />
  )
  return (
    <div className="overlay">
      <div className="panel" style={{ maxWidth: 900, margin: '0 auto' }}>
        <b>{title}</b>
        {!pages.length ? (
          <>
            <div className="hint">วางเอกสารบนพื้นเรียบที่แสงพอ ให้เห็นครบทุกมุม แล้วถ่ายรูป ระบบจะช่วยตัดขอบและปรับให้คมชัด เพิ่มได้หลายหน้า แล้วรวมเป็น PDF ให้</div>
            <div className="ctl">
              <button type="button" className="btn pri" disabled={!!busy} onClick={() => cam.current.click()}>📷 ถ่ายรูปด้วยกล้อง</button>
              <button type="button" className="btn" disabled={!!busy} onClick={() => alb.current.click()}>🖼️ เลือกรูปจากเครื่อง</button>
              <button type="button" className="btn" onClick={onCancel}>ยกเลิก</button>
            </div>
            <div className="hint">บนคอมพิวเตอร์ปุ่มถ่ายรูปจะเปิดหน้าต่างเลือกไฟล์ ใช้มือถือจะสะดวกที่สุด</div>
          </>
        ) : (
          <>
            <div className="thumbs">
              {pages.map((p, i) => (
                <button type="button" key={p.id} className={'th' + (i === cur ? ' on' : '')} onClick={() => { setCur(i); setView('edit') }} aria-label={'หน้า ' + (i + 1)}>
                  <img src={p.thumb} alt="" /><span>{i + 1}</span>
                </button>
              ))}
              {pages.length < maxPages && <button type="button" className="th add" disabled={!!busy} onClick={() => cam.current.click()}>＋<span>ถ่ายเพิ่ม</span></button>}
            </div>
            <div className="ctl">
              <button type="button" className={'btn sm' + (view === 'edit' ? ' pri' : '')} onClick={() => setView('edit')}>1 ปรับกรอบ</button>
              <button type="button" className={'btn sm' + (view === 'result' ? ' pri' : '')} onClick={() => setView('result')}>2 ดูผลลัพธ์</button>
              <button type="button" className="btn sm" onClick={() => rotate(-1)} aria-label="หมุนซ้าย">↺ หมุนซ้าย</button>
              <button type="button" className="btn sm" onClick={() => rotate(1)} aria-label="หมุนขวา">↻ หมุนขวา</button>
              <button type="button" className="btn sm" onClick={() => alb.current.click()}>🖼️ เพิ่มจากเครื่อง</button>
            </div>
            {view === 'edit' ? (
              <>
                <div className="hint">ลากจุดสีเหลืองทั้ง 4 มุมให้ตรงกับขอบกระดาษ (ระบบเดาขอบให้เบื้องต้น)</div>
                <div className="sw"><canvas ref={edit} className="scv" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /></div>
              </>
            ) : (
              <>
                <div className="ctl">
                  <span className="sub">ปรับภาพ</span>
                  {FILTERS.map(([k, t]) => <button type="button" key={k} className={'btn sm' + (pg.filter === k ? ' pri' : '')} onClick={() => patch(cur, { filter: k })}>{t}</button>)}
                  {pages.length > 1 && <button type="button" className="btn sm" onClick={() => setPages((a) => a.map((x) => ({ ...x, filter: pg.filter })))}>ใช้กับทุกหน้า</button>}
                </div>
                <div className="sw"><canvas ref={res} className="scv" /></div>
              </>
            )}
            <div className="ctl" style={{ marginTop: 12 }}>
              <button type="button" className="btn pri" disabled={!!busy} onClick={finish}>{busy || `ใช้ ${pages.length} หน้านี้`}</button>
              <button type="button" className="btn" disabled={!!busy} onClick={remove}>ลบหน้านี้</button>
              <button type="button" className="btn" disabled={!!busy} onClick={onCancel}>ยกเลิก</button>
            </div>
          </>
        )}
        {busy && !pages.length && <div className="hint">{busy}</div>}
        {msg && <div className="err">{msg}</div>}
        {pick(cam)}{pick(alb)}
      </div>
    </div>
  )
}
