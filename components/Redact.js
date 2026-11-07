'use client'
import { useEffect, useRef, useState } from 'react'

// Draw black boxes over religion and blood type; returns rectangles in original-image coordinates
export default function Redact({ img, onSave, onCancel }) {
  const ref = useRef(null), R = useRef([]), cur = useRef(null), s0 = useRef(null)
  const [msg, setMsg] = useState('')
  const sc = Math.min(1, 1200 / img.width)
  const draw = () => {
    const cv = ref.current, g = cv.getContext('2d')
    g.drawImage(img, 0, 0, cv.width, cv.height); g.fillStyle = '#000'
    R.current.concat(cur.current ? [cur.current] : []).forEach((q) => g.fillRect(q[0], q[1], q[2], q[3]))
  }
  useEffect(() => { const cv = ref.current; cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); draw() }, [])
  const pt = (e) => { const cv = ref.current, b = cv.getBoundingClientRect(); return [((e.clientX - b.left) * cv.width) / b.width, ((e.clientY - b.top) * cv.height) / b.height] }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.6)', overflow: 'auto', padding: 16 }}>
      <div className="panel" style={{ maxWidth: 760, margin: '0 auto' }}>
        <b>ปิดบังข้อมูลบนบัตรประชาชน</b>
        <div className="hint">ลากนิ้วหรือเมาส์คลุมคำว่า <b>ศาสนา</b> และ <b>หมู่โลหิต</b> ให้เป็นแถบดำ แล้วกดบันทึก</div>
        <canvas ref={ref} style={{ width: '100%', touchAction: 'none', border: '1px solid var(--line)', borderRadius: 6, cursor: 'crosshair', marginTop: 8 }}
          onPointerDown={(e) => { s0.current = pt(e); e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerMove={(e) => { if (!s0.current) return; const p = pt(e), s = s0.current; cur.current = [Math.min(s[0], p[0]), Math.min(s[1], p[1]), Math.abs(p[0] - s[0]), Math.abs(p[1] - s[1])]; draw() }}
          onPointerUp={() => { const q = cur.current; if (q && q[2] > 4 && q[3] > 4) R.current.push(q); s0.current = cur.current = null; draw() }} />
        <div className="ctl" style={{ marginTop: 10 }}>
          <button className="btn pri" onClick={() => R.current.length ? onSave(R.current.map((q) => q.map((v) => v / sc))) : setMsg('ยังไม่ได้ลากแถบดำ ลากคลุมศาสนาและหมู่โลหิตก่อน')}>บันทึกและอัปโหลด</button>
          <button className="btn" onClick={() => { R.current.pop(); draw() }}>ย้อนกลับ 1 แถบ</button>
          <button className="btn" onClick={onCancel}>ยกเลิก</button>
        </div>
        {msg && <div className="err">{msg}</div>}
      </div>
    </div>
  )
}
