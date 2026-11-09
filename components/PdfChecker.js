'use client'
import { useRef, useState } from 'react'
import { DEFAULTS, analyze, plan, assignNames, fixOne, mb, ext } from '../lib/pdfcheck'

// Recruiter tab: PDF Checker & Automation Prep (from HR Document Hub). Everything runs in this browser; nothing is uploaded.
const LBL = { checking: ['', 'กำลังตรวจ...'], ok: ['ok', 'พร้อมส่ง'], fix: ['', 'ต้องแก้'], fixed: ['ok', 'แก้แล้ว พร้อมส่ง'], review: ['', 'ต้องตรวจเอง'], er: ['bad', 'แก้อัตโนมัติไม่ได้'] }
const MT = { raster: 'แปลงเป็นภาพ + สร้าง PDF ใหม่ (ข้อความเลือกไม่ได้)', clean: 'สร้าง PDF ใหม่ (เก็บข้อความ)', name: 'เปลี่ยนชื่อไฟล์อย่างเดียว' }
const MARK = { ok: '✓', wn: '!', er: '✕' }

export default function PdfChecker() {
  const [cfg, setCfg] = useState(DEFAULTS)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [msg, setMsg] = useState('')
  const inp = useRef(null), cancel = useRef(false), seq = useRef(1), cur = useRef(items), cf = useRef(cfg)
  cf.current = cfg
  const commit = (fn) => { const n = assignNames(fn(cur.current), cf.current); cur.current = n; setItems(n) }
  const patch = (id, p) => commit((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }))

  async function checkOne(it) {
    try { const a = await analyze(it.file, cf.current); patch(it.id, { a, ...plan(a, cf.current), msg: '' }) }
    catch (x) { patch(it.id, { state: 'er', msg: 'ตรวจไม่สำเร็จ: ' + (x.message || x) }) }
  }
  async function add(files) {
    const news = [...files].map((file) => ({ id: seq.current++, file, state: 'checking', name: file.name, a: null }))
    if (!news.length) return
    commit((a) => [...a, ...news])
    for (const it of news) await checkOne(it)
  }
  async function recheck() {
    commit((a) => a.map((x) => (x.busy ? x : { ...x, out: null, a2: null, msg: '', note: '', state: 'checking', ...(x.manual ? {} : { name: x.file.name }) })))
    for (const it of cur.current) if (!it.busy) await checkOne(it)
  }
  async function fix(it) {
    patch(it.id, { busy: true, msg: '', note: '' })
    try {
      const r = await fixOne(it, cf.current, { onProg: (t) => patch(it.id, { prog: t }), shouldStop: () => cancel.current })
      const bad = r.a2.r.filter((x) => x.s === 'er')
      patch(it.id, { busy: false, prog: '', out: r.out, a2: r.a2, mode: r.mode, note: r.note, name: r.name, state: bad.length ? 'er' : 'fixed', msg: bad.map((x) => x.t).join(', ') })
    } catch (x) { patch(it.id, { busy: false, prog: '', state: 'er', msg: 'แก้ไม่สำเร็จ: ' + (x.message || x) }) }
  }
  async function fixAll() {
    setBusy(true); cancel.current = false
    for (const it of cur.current.filter((x) => x.state === 'fix')) { if (cancel.current) break; await fix(cur.current.find((x) => x.id === it.id)) }
    setBusy(false)
  }
  const save = (blob, name) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000) }
  const fileOf = (it) => it.out || it.file
  async function zip() {
    const { default: JSZip } = await import('jszip'), z = new JSZip()
    items.filter((x) => x.state === 'ok' || x.state === 'fixed').forEach((x) => z.file(x.name, fileOf(x)))
    save(await z.generateAsync({ type: 'blob' }), 'ready-files.zip')
  }

  const n = (s) => items.filter((x) => x.state === s).length, nf = n('fix'), ready = n('ok') + n('fixed')
  const Num = ({ k, min, max, step }) => <input type="number" min={min} max={max} step={step || 1} value={cfg[k]} style={{ width: 90 }} onChange={(e) => set(k, Math.max(min, Math.min(max, +e.target.value || min)))} />
  return (
    <>
      <div className="hint" style={{ marginBottom: 10 }}>ตรวจชื่อไฟล์ ขนาด และโครงสร้าง PDF ก่อนส่งเข้า Power Automate / Outlook แล้วแก้ให้ในครั้งเดียว ไฟล์ไม่ถูกส่งไปที่ไหน ทำงานในเครื่องนี้เท่านั้น</div>
      <div className="panel">
        <div className="ctl" style={{ marginTop: 0 }}>
          <label className="f" style={{ margin: 0 }}>ขนาดสูงสุด (MB) <Num k="lim" min={1} max={500} /></label>
          <label className="chk2"><input type="checkbox" checked={cfg.b64} onChange={(e) => set('b64', e.target.checked)} /> คิดขนาดแบบ Base64 (+33%)</label>
        </div>
        <div className="hint">ค่าประมาณ ×4/3 ลิมิตจริงขึ้นกับระบบปลายทาง ปรับให้ตรงกับ flow ของคุณ</div>
        <div className="ctl">
          <label className="chk2"><input type="checkbox" checked={cfg.ascii} onChange={(e) => set('ascii', e.target.checked)} /> ชื่อไฟล์ต้องเป็น ASCII (ไม่มีไทย/ช่องว่าง)</label>
          <label className="f" style={{ margin: 0 }}>ความยาวชื่อสูงสุด <Num k="maxLen" min={20} max={255} /></label>
        </div>
        <div className="ctl">
          <label className="f" style={{ margin: 0 }}>วิธีแก้ PDF
            <select value={cfg.strategy} onChange={(e) => set('strategy', e.target.value)}>
              <option value="rename">A: เปลี่ยนชื่ออย่างเดียว</option><option value="clean">B: สร้างใหม่ เก็บข้อความ</option><option value="raster">C: แปลงเป็นภาพแล้วสร้างใหม่</option>
            </select></label>
          <label className="chk2"><input type="checkbox" checked={cfg.needWord} onChange={(e) => set('needWord', e.target.checked)} /> PDF ที่ไม่ได้มาจาก Word ให้สร้างใหม่</label>
          <label className="chk2"><input type="checkbox" checked={cfg.imgToPdf} onChange={(e) => set('imgToPdf', e.target.checked)} /> D: แปลงรูปเป็น PDF</label>
        </div>
        <div className="hint">C ทำให้ข้อความเลือกไม่ได้ และอาจสูญเสียลิงก์ ฟอร์ม และลายเซ็น ระบบจะเลือกวิธีที่กระทบน้อยที่สุดก่อนเสมอ · หลังเปลี่ยนค่า กด "ตรวจทั้งหมดใหม่"</div>
      </div>

      <div className={'drop' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}>
        <b>แตะเพื่อเลือกไฟล์ หรือลากมาวาง</b>
        <div className="hint">PDF, Word, Excel, PNG, JPG (เลือกได้หลายไฟล์)</div>
        <div className="ctl" style={{ justifyContent: 'center' }}><button type="button" className="btn pri" onClick={() => inp.current.click()}>เลือกไฟล์</button></div>
        <input ref={inp} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <div className="panel">
          <b>สรุป</b> ทั้งหมด {items.length} · พร้อมส่ง {n('ok')} · แก้แล้ว {n('fixed')} · ต้องตรวจเอง {n('review')} · ต้องแก้ {nf} · แก้ไม่ได้ {n('er')}
          <div className="ctl">
            <button type="button" className="btn pri" disabled={!nf || busy} onClick={fixAll}>แก้ทั้งหมด ({nf})</button>
            <button type="button" className="btn" disabled={busy} onClick={recheck}>ตรวจทั้งหมดใหม่</button>
            {busy && <button type="button" className="btn" onClick={() => { cancel.current = true; setMsg('กำลังยกเลิกหลังไฟล์ปัจจุบัน') }}>ยกเลิก</button>}
            <button type="button" className="btn" disabled={!ready} onClick={zip}>ดาวน์โหลดไฟล์พร้อมส่ง (ZIP)</button>
            <button type="button" className="btn" disabled={busy} onClick={() => commit(() => [])}>ล้างรายการ</button>
          </div>
          <div className="hint">ZIP รวมเฉพาะไฟล์ที่ผ่านกฎและแก้แล้ว ไฟล์ที่ต้องตรวจเองดาวน์โหลดแยกหลังตรวจ ระบบไม่ส่งไฟล์ไปยังแพลตฟอร์มใดอัตโนมัติ</div>
          {msg && <div className="hint">{msg}</div>}
        </div>
      )}

      {items.map((it) => {
        const [c, t] = LBL[it.state], list = it.a2 || it.a, dl = ['ok', 'fixed', 'review'].includes(it.state)
        return (
          <section className="panel" key={it.id}>
            <div className="fl"><b style={{ wordBreak: 'break-all' }}>{it.file.name}</b><span className={'tag ' + c}>{it.busy ? 'กำลังแก้...' : t}</span></div>
            <div className="hint">{mb(it.file.size)}{it.a ? ' · ประมาณเมื่อเข้ารหัส ' + mb(cfg.b64 ? (it.file.size * 4) / 3 : it.file.size) : ''} · .{it.a ? it.a.e : ext(it.file.name)}</div>
            {it.state === 'fix' && <div className="hint">จะทำ: {MT[it.mode]}</div>}
            {it.out && <div className="hint">ผลลัพธ์: {it.out.name} ({mb(it.out.size)})</div>}
            {it.dup && <div className="hint">ชื่อซ้ำกับไฟล์อื่น จึงเติมเลขต่อท้าย</div>}
            {it.note && <div className="hint">{it.note}</div>}
            {it.msg && <div className="err">{it.msg}</div>}
            {it.prog && <div className="hint">{it.prog}</div>}
            {it.a && it.a.pw && <div className="err">PDF มีรหัสผ่าน ต้องปลดล็อกก่อน</div>}
            {it.a && it.a.signed && it.mode && it.mode !== 'name' && <div className="err">ไฟล์นี้มีตัวบ่งชี้ลายเซ็นดิจิทัล การแก้ด้วยวิธีนี้จะทำให้ลายเซ็นใช้ไม่ได้</div>}
            {list && (
              <details><summary>{it.a2 ? 'รายการตรวจสุดท้ายของไฟล์ที่แก้แล้ว' : 'รายละเอียดการตรวจ'}</summary>
                {list.r.map((x, i) => <div key={i} className="pcr"><span className={'pcm ' + x.s}>{MARK[x.s]}</span><div>{x.t}{x.d && <small>{x.d}</small>}</div></div>)}
              </details>
            )}
            <div className="ctl">
              <label className="f" style={{ margin: 0, flex: '1 1 240px' }}>ชื่อไฟล์ผลลัพธ์
                <input type="text" value={it.name || it.file.name} disabled={it.busy} onChange={(e) => patch(it.id, { name: e.target.value, manual: e.target.value })} /></label>
              {it.state === 'fix' && <button type="button" className="btn pri" disabled={it.busy} onClick={() => fix(it)}>แก้ไฟล์นี้</button>}
              {dl && <button type="button" className="btn" onClick={() => save(fileOf(it), it.name)}>ดาวน์โหลด</button>}
              <button type="button" className="btn" disabled={it.busy} onClick={() => commit((a) => a.filter((x) => x.id !== it.id))}>เอาออก</button>
            </div>
          </section>
        )
      })}
    </>
  )
}
