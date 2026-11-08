'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BUCKET } from '../lib/upload'
import { req, nm, base, fname, fdt } from '../lib/categories'
import { DS, docStatus, catStatus, chainOf } from '../lib/status'
import Avatar from './Avatar'
import Fold from './Fold'
import Versions from './Versions'

// Document Review Center: every uploaded file of one candidate on a single screen.
// Preview + Approve / Request Revision / Comment + history, no need to open files one by one.
const Tag = ({ s }) => <span className={'tag ' + DS[s][2]}>{DS[s][0]} · {DS[s][1]}</span>

function DocCard({ d, c, m, chain, events, urls, onReview, onComment, onOpened }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  const [vi, setVi] = useState(chain.length - 1)
  const [rev, setRev] = useState(null)      // null = closed, string = reason being typed
  const [cm, setCm] = useState('')
  const [vis, setVis] = useState(false)
  const latest = vi === chain.length - 1
  const file = chain[vi] || d
  const url = urls[file.id]
  useEffect(() => { setVi(chain.length - 1) }, [chain.length])
  // a card counts as "opened" the first time it scrolls into view -> Received becomes Pending
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() } }, { threshold: 0.25 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  useEffect(() => { if (seen && !d.opened_at) onOpened(d) }, [seen]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = docStatus(d)
  return (
    <article className="dc" id={'rc-' + d.id} ref={ref}>
      <div className="fl">
        <b style={{ minWidth: 0, wordBreak: 'break-word' }}>{fname(c, d, m)}</b>
        <span style={{ whiteSpace: 'nowrap' }}>{d.rev > 1 && <span className="tag n">v{d.rev}</span>} <Tag s={s} /></span>
      </div>
      <div className="hint">{d.original_name} · อัปเดต {fdt(d.updated_at || d.created_at)}
        {d.category === '2.1' && (d.redaction === 'tool' ? ` · ปิดบังด้วยเครื่องมือ ${d.redaction_boxes || ''} จุด${d.redaction_checked_at ? ' · HR ตรวจแล้ว' : ' · รอ HR ตรวจไฟล์สุดท้าย'}` : ' · ไม่ผ่านเครื่องมือปิดบัง อนุมัติไม่ได้')}</div>
      {d.status === 'fix' && <div className="err">เหตุผลที่ขอแก้ไข: {d.note || '-'}</div>}
      {!latest && <div className="err">กำลังดูไฟล์ฉบับเก่า (v{file.rev}) การตรวจมีผลกับฉบับล่าสุดเท่านั้น</div>}
      <div className="pv">
        {!seen ? <div className="sub">กำลังรอแสดงตัวอย่าง...</div>
          : !url ? <div className="sub">กำลังโหลดไฟล์...</div>
          : file.ext === 'pdf' ? <iframe src={url} title={file.original_name} loading="lazy" />
          : <img src={url} alt={file.original_name} />}
      </div>
      <div className="ctl">
        {d.status !== 'ok' && <button type="button" className="btn pri sm" disabled={!seen || !latest} onClick={() => onReview(d, 'ok')}>✓ Approve</button>}
        {d.status !== 'fix' && <button type="button" className="btn sm" disabled={!latest} onClick={() => setRev(rev === null ? '' : null)}>↺ Request Revision</button>}
        {d.status !== 'wait' && <button type="button" className="btn sm" disabled={!latest} onClick={() => onReview(d, 'wait')}>ยกเลิกผลตรวจ</button>}
        {url && <a className="btn sm" href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>เปิดในแท็บใหม่</a>}
      </div>
      {rev !== null && (
        <div className="rb">
          <label className="f ink">เหตุผลที่ต้องแก้ไข (แคนดิเดตจะเห็น)
            <input type="text" value={rev} autoFocus placeholder="เช่น ภาพไม่ชัด / เอกสารไม่ครบหน้า" onChange={(e) => setRev(e.target.value)} /></label>
          <div className="ctl"><button type="button" className="btn pri sm" disabled={!rev.trim()} onClick={async () => { await onReview(d, 'fix', rev); setRev(null) }}>ส่งขอแก้ไข</button>
            <button type="button" className="btn sm" onClick={() => setRev(null)}>ยกเลิก</button></div>
        </div>
      )}
      <div className="cmbox">
        <input type="text" value={cm} placeholder="เพิ่มความเห็น (Comment)" onChange={(e) => setCm(e.target.value)} />
        <label className="chk2"><input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} /> แคนดิเดตเห็น</label>
        <button type="button" className="btn sm" disabled={!cm.trim()} onClick={async () => { await onComment(d, cm.trim(), vis); setCm('') }}>ส่งความเห็น</button>
      </div>
      <Fold small title="ประวัติการตรวจสอบและเวอร์ชัน" badge={<span className="tag g" style={{ marginLeft: 8 }}>{events.filter((e) => chain.some((x) => x.id === e.document_id)).length}</span>}>
        <Versions chain={chain} events={events} onOpen={(f, i) => setVi(i)} openLabel="ดูไฟล์นี้" activeIndex={vi} />
      </Fold>
    </article>
  )
}

export default function ReviewCenter({ c, m, hist, events, photo, onBack, onReview, onComment, onOpened }) {
  const [urls, setUrls] = useState({})
  const files = [...m, ...hist]
  const key = files.map((d) => d.id).sort().join(',')
  useEffect(() => {
    let off = false
    if (!files.length) { setUrls({}); return }
    supabase.storage.from(BUCKET).createSignedUrls(files.map((d) => d.storage_path), 3600).then(({ data }) => {
      if (off || !data) return
      const byPath = Object.fromEntries(data.filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]))
      setUrls(Object.fromEntries(files.filter((d) => byPath[d.storage_path]).map((d) => [d.id, byPath[d.storage_path]])))
    })
    return () => { off = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const cats = req(c)
  const count = { missing: 0, received: 0, pending: 0, verified: 0, revision: 0 }
  m.forEach((d) => { count[docStatus(d)]++ })
  const missing = cats.filter((k) => !k[5] && !m.some((d) => d.category === k[0]))
  count.missing = missing.length
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div>
      <div className="ctl" style={{ marginBottom: 10 }}><button type="button" className="btn sm" onClick={onBack}>← กลับรายการ</button></div>
      <div className="srf" style={{ marginTop: 0 }}>
        <Avatar url={photo} name={c.first_name ? base(c) : ''} size={84} portrait />
        <div style={{ minWidth: 0 }}>
          <div className="sub">Document Review Center · SRF {c.srf_no}</div>
          <div className="nm">{c.first_name ? base(c) : 'ยังไม่ได้กรอกชื่อ'}</div>
          <div className="sub">{c.position} · {c.email}</div>
          <div className="meta">{Object.keys(count).map((k) => <span key={k} className={'tag ' + DS[k][2]}>{DS[k][0]} {count[k]}</span>)}</div>
        </div>
      </div>
      <div className="rc">
        <nav className="rcn" aria-label="รายการเอกสาร">
          {cats.map((k) => {
            const l = m.filter((d) => d.category === k[0]), s = catStatus(l)
            return (
              <button type="button" key={k[0]} className="rci" disabled={!l.length} onClick={() => l[0] && go('rc-' + l[0].id)}>
                <span>{nm(k[0])}{k[1]}{k[5] ? '' : ' *'}</span>{k[5] && !l.length ? <span className="mute">ไม่บังคับ</span> : <span className={'tag ' + DS[s][2]}>{DS[s][0]}</span>}
              </button>
            )
          })}
          <div className="hint">* = เอกสารบังคับ</div>
        </nav>
        <div className="rcm">
          {missing.length > 0 && <div className="panel" style={{ boxShadow: 'none' }}><span className="tag g">Missing · ยังไม่ได้รับ</span><div className="err">{missing.map((k) => nm(k[0]) + k[1]).join(' · ')}</div></div>}
          {!m.length && <div className="panel">แคนดิเดตยังไม่ได้อัปโหลดไฟล์</div>}
          {cats.map((k) => m.filter((d) => d.category === k[0]).map((d) => (
            <DocCard key={d.id} d={d} c={c} m={m} chain={chainOf(d, hist)} events={events} urls={urls} onReview={onReview} onComment={onComment} onOpened={onOpened} />
          )))}
        </div>
      </div>
    </div>
  )
}
