'use client'
import { useEffect, useRef, useState } from 'react'

// Multi-page redaction. `pages` are images or canvases. onSave(rectsPerPage) gives rectangles in each page's own coordinates.
export default function Redact({ pages, onSave, onCancel }) {
  const ref = useRef(null), R = useRef(pages.map(() => [])), cur = useRef(null), s0 = useRef(null)
  const [pi, setPi] = useState(0)
  const [msg, setMsg] = useState('')
  const [sure, setSure] = useState(false)
  const [, bump] = useState(0)
  const img = pages[pi]
  const scs = pages.map((p) => Math.min(1, 1200 / p.width))
  const total = () => R.current.reduce((a, r) => a + r.length, 0)
  const draw = () => {
    const cv = ref.current; if (!cv) return
    const g = cv.getContext('2d')
    g.drawImage(img, 0, 0, cv.width, cv.height); g.fillStyle = '#000'
    R.current[pi].concat(cur.current ? [cur.current] : []).forEach((q) => g.fillRect(q[0], q[1], q[2], q[3]))
  }
  useEffect(() => { const cv = ref.current; cv.width = Math.round(img.width * scs[pi]); cv.height = Math.round(img.height * scs[pi]); draw() }, [pi])
  const pt = (e) => { const cv = ref.current, b = cv.getBoundingClientRect(); return [((e.clientX - b.left) * cv.width) / b.width, ((e.clientY - b.top) * cv.height) / b.height] }
  function save() {
    if (!total()) { setMsg('ยังไม่ได้ลากแถบดำ ลากคลุมศาสนาและหมู่โลหิตก่อน'); return }
    if (!sure) { setMsg('กรุณายืนยันว่าตรวจดูผลที่ปิดบังแล้ว'); return }
    onSave(R.current.map((rs, i) => rs.map((q) => q.map((v) => v / scs[i]))))
  }
  return (
    <div className="overlay">
      <div className="panel" style={{ maxWidth: 780, margin: '0 auto' }}>
        <b>ปิดบังข้อมูลบนบัตรประชาชน</b>
        <div className="hint">ลากนิ้วหรือเมาส์คลุมคำว่า <b>ศาสนา</b> และ <b>หมู่โลหิต</b> ให้เป็นแถบดำ ไฟล์ที่ส่งขึ้นระบบจะเป็นภาพที่ปิดบังแล้วเท่านั้น (ไฟล์ต้นฉบับไม่ถูกอัปโหลด)</div>
        {pages.length > 1 && (
          <div className="ctl"><button className="btn sm" disabled={pi === 0} onClick={() => setPi(pi - 1)}>หน้าก่อนหน้า</button>
            <span className="sub">หน้า {pi + 1} / {pages.length}</span>
            <button className="btn sm" disabled={pi === pages.length - 1} onClick={() => setPi(pi + 1)}>หน้าถัดไป</button></div>
        )}
        <canvas ref={ref} className="rcv"
          onPointerDown={(e) => { s0.current = pt(e); e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerMove={(e) => { if (!s0.current) return; const p = pt(e), s = s0.current; cur.current = [Math.min(s[0], p[0]), Math.min(s[1], p[1]), Math.abs(p[0] - s[0]), Math.abs(p[1] - s[1])]; draw() }}
          onPointerUp={() => { const q = cur.current; if (q && q[2] > 4 && q[3] > 4) R.current[pi].push(q); s0.current = cur.current = null; draw(); bump((x) => x + 1) }} />
        <label className="f ink"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> ฉันตรวจดูทุกหน้าแล้ว ศาสนาและหมู่โลหิตถูกปิดบังครบ (ปิดบังแล้ว {total()} จุด)</label>
        <div className="ctl" style={{ marginTop: 10 }}>
          <button className="btn pri" onClick={save}>บันทึกและอัปโหลด</button>
          <button className="btn" onClick={() => { R.current[pi].pop(); draw(); bump((x) => x + 1) }}>ย้อนกลับ 1 แถบ</button>
          <button className="btn" onClick={onCancel}>ยกเลิก</button>
        </div>
        {msg && <div className="err">{msg}</div>}
      </div>
    </div>
  )
}
