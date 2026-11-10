'use client'
import { useEffect, useRef, useState } from 'react'
import { getPdfjs } from '../lib/pdf'
import { loadImg, mkPdf } from '../lib/images'
import { fitCanvas, rotateCanvas } from '../lib/scan'

// Preview with the same tools for EVERY file (PDF or picture): zoom, rotate a page, delete a page, move a page, then Save.
// PDFs are drawn by this page (not by the browser's own PDF viewer), so it looks the same on every computer.
// Save: PDF -> same PDF with the pages turned / removed / re-ordered (text is kept); picture -> turned picture as JPG.
function PageCv({ cv, zoom }) {
  const ref = useRef(null)
  useEffect(() => { const c = ref.current; c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0) }, [cv])
  return <canvas ref={ref} className="dvc" style={{ width: zoom * 100 + '%' }} />
}

export default function DocViewer({ url, ext, name, canEdit, onSave }) {
  const [pages, setPages] = useState(null)   // [{ id, idx, rot, cv }]
  const [bytes, setBytes] = useState(null)
  const [err, setErr] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [urlKey, setUrlKey] = useState(0)
  const nid = useRef(1)

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer()
        if (off) return
        const list = []
        if (ext === 'pdf') {
          const pdfjs = await getPdfjs(), doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
          for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
            const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(2, 1200 / v1.width) })
            const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height)
            const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height)
            await pg.render({ canvasContext: g, viewport: vp }).promise
            list.push({ id: nid.current++, idx: i - 1, rot: 0, cv })
            if (off) return
          }
        } else {
          list.push({ id: nid.current++, idx: 0, rot: 0, cv: fitCanvas(await loadImg(new Blob([buf])), 2400) })
        }
        if (!off) { setBytes(buf); setPages(list) }
      } catch { if (!off) setErr(true) }
    })()
    return () => { off = true }
  }, [url, ext, urlKey])

  const edit = (fn) => { setPages(fn); setDirty(true); setMsg('') }
  const turn = (i, d) => edit((a) => a.map((p, j) => (i !== -1 && j !== i ? p : { ...p, rot: (p.rot + d * 90 + 360) % 360, cv: rotateCanvas(p.cv, d), id: nid.current++ })))
  const drop = (i) => edit((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a))
  const move = (i, d) => edit((a) => { const b = [...a], j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b })

  async function save() {
    setBusy(true); setMsg('')
    try {
      let blob, e = ext
      if (ext === 'pdf') {
        try {
          const { PDFDocument, degrees } = await import('pdf-lib')
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true }), out = await PDFDocument.create()
          const cp = await out.copyPages(src, pages.map((p) => p.idx))
          cp.forEach((pg, i) => { pg.setRotation(degrees((((pg.getRotation().angle + pages[i].rot) % 360) + 360) % 360)); out.addPage(pg) })
          blob = new Blob([await out.save()], { type: 'application/pdf' })
        } catch {
          // odd PDF that pdf-lib cannot copy: rebuild from the pictures of the pages
          const bl = await Promise.all(pages.map((p) => new Promise((ok) => p.cv.toBlob((b) => { b.w = p.cv.width; b.h = p.cv.height; ok(b) }, 'image/jpeg', 0.92))))
          blob = await mkPdf(bl)
        }
      } else {
        const cv = pages[0].cv
        blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.92)); e = 'jpg'
      }
      const done = await onSave(blob, e)
      if (done === false) setMsg('บันทึกไม่สำเร็จ'); else setDirty(false)
    } catch { setMsg('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง') }
    setBusy(false)
  }

  if (err) return ( // viewer failed (blocked worker / network): show the browser's own preview and say so, tools below are NOT available
    <div>
      <div className="err">เปิดด้วยตัวแก้ไขของระบบไม่สำเร็จ จึงแสดงด้วยตัวดูของเบราว์เซอร์แทน (ไม่มีปุ่มหมุน/บันทึกของระบบ) <button type="button" className="btn sm" onClick={() => { setErr(false); setPages(null); setUrlKey((k) => k + 1) }}>ลองใหม่</button></div>
      {ext === 'pdf' ? <iframe src={url} title={name} /> : <img src={url} alt={name} />}
    </div>
  )
  if (!pages) return <div className="sub">กำลังโหลดตัวอย่าง...</div>
  return (
    <div className="dv">
      <div className="ctl dvt">
        <button type="button" className="btn sm" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="ซูมออก">−</button>
        <b style={{ minWidth: 46, textAlign: 'center' }}>{Math.round(zoom * 100)}%</b>
        <button type="button" className="btn sm" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="ซูมเข้า">+</button>
        <button type="button" className="btn sm" onClick={() => setZoom(1)}>พอดีหน้า</button>
        {canEdit && <>
          <span className="sub">ทุกหน้า</span>
          <button type="button" className="btn sm" onClick={() => turn(-1, -1)} aria-label="หมุนทุกหน้าซ้าย">↺</button>
          <button type="button" className="btn sm" onClick={() => turn(-1, 1)} aria-label="หมุนทุกหน้าขวา">↻</button>
        </>}
        {canEdit && dirty && <>
          <button type="button" className="btn pri sm" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : '💾 บันทึกไฟล์ที่แก้'}</button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => { setPages(null); setDirty(false); setErr(false); setBytes(null); setUrlKey((k) => k + 1) }}>ยกเลิกการแก้</button>
        </>}
      </div>
      {canEdit && dirty && <div className="hint">ยังไม่ได้บันทึก · บันทึกแล้วสถานะ Verified จะกลับเป็นรอตรวจ ต้อง Approve อีกครั้ง</div>}
      {msg && <div className="err">{msg}</div>}
      <div className="dvs">
        {pages.map((p, i) => (
          <div className="dvp" key={p.id}>
            <div className="ctl dvh">
              <span className="sub">หน้า {i + 1} / {pages.length}</span>
              {canEdit && <>
                <button type="button" className="btn sm" onClick={() => turn(i, -1)} aria-label="หมุนซ้าย">↺ หมุนซ้าย</button>
                <button type="button" className="btn sm" onClick={() => turn(i, 1)} aria-label="หมุนขวา">↻ หมุนขวา</button>
                {pages.length > 1 && <>
                  <button type="button" className="btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">↑</button>
                  <button type="button" className="btn sm" disabled={i === pages.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">↓</button>
                  <button type="button" className="btn sm" onClick={() => drop(i)}>ลบหน้านี้</button>
                </>}
              </>}
            </div>
            <div className="dvw"><PageCv cv={p.cv} zoom={zoom} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}
