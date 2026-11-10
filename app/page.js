'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { req, reqd, okCat, fname, nm, lbl, fdt, C, sexTh, redactTxt } from '../lib/categories'
import { loadImg, toJpg, mkPdf } from '../lib/images'
import { BUCKET, extOf, genericJobs, storeJobs } from '../lib/upload'
import { pdfPages, askUntilOpen } from '../lib/pdf'
import LoginScreen from '../components/LoginScreen'
import Redact from '../components/Redact'
import Scanner from '../components/Scanner'
import Summary from '../components/Summary'
import Stepper from '../components/Stepper'
import BulkUpload from '../components/BulkUpload'
import Avatar from '../components/Avatar'
import Fold from '../components/Fold'
import Versions from '../components/Versions'
import { DS, docStatus, catStatus, chainOf } from '../lib/status'
import { usePhotoUrls } from '../lib/photos'

// progress ring (n of total)
function Ring({ n, total }) {
  const p = total ? n / total : 0, R = 30, C2 = 2 * Math.PI * R
  return (
    <div className="ring" role="img" aria-label={'ส่งแล้ว ' + n + ' จาก ' + total}>
      <svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="38" cy="38" r={R} fill="none" stroke="var(--pri)" strokeWidth="6" strokeLinecap="round" strokeDasharray={C2} strokeDashoffset={C2 * (1 - p)} transform="rotate(-90 38 38)" /></svg>
      <span><b>{n}</b>/{total}</span>
    </div>
  )
}
// asks for the password of a locked PDF; the file is unlocked in this browser, the password is never sent or stored
function PwAsk({ file, wrong, onDone }) {
  const [v, setV] = useState(''), [show, setShow] = useState(false)
  return (
    <div className="overlay">
      <div className="panel" style={{ maxWidth: 460, margin: '60px auto' }}>
        <b>ไฟล์นี้มีรหัสผ่าน</b>
        <div className="hint" style={{ wordBreak: 'break-all' }}>{file.name}</div>
        <div className="hint">กรอกรหัสผ่านของไฟล์ ระบบจะปลดล็อกในเครื่องของคุณ แล้วส่งต่อให้ Recruiter รหัสผ่านไม่ถูกส่งหรือบันทึกไว้ที่ไหน (ไฟล์ที่ปลดล็อกแล้วจะเป็นภาพ เลือกหรือค้นหาข้อความไม่ได้)</div>
        {wrong && <div className="err">รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง</div>}
        <label className="f">รหัสผ่านของไฟล์<input type={show ? 'text' : 'password'} autoFocus autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v) onDone(v) }} /></label>
        <label className="chk2"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> แสดงรหัสผ่าน</label>
        <div className="ctl"><button type="button" className="btn pri" disabled={!v} onClick={() => onDone(v)}>ปลดล็อก</button><button type="button" className="btn" onClick={() => onDone(null)}>ข้ามไฟล์นี้</button></div>
      </div>
    </div>
  )
}
const Shell = ({ children, right }) => (
  <>
    <div className="topbar"><div className="topin">
      <div className="brand"><span className="logo">CD</span><div><b>Candidate Document Portal</b><div className="sub">เอกสารสำหรับการจ้างงาน</div></div></div>
      {right}
    </div></div>
    <div className="wrap">{children}</div>
  </>
)

export default function Home() {
  const [ses, setSes] = useState(undefined)
  const [c, setC] = useState(undefined)
  const [docs, setD] = useState([])        // active files
  const [hist, setH] = useState([])        // older revisions
  const [ev, setEv] = useState([])         // review log visible to the candidate
  const [p, setP] = useState({ fn: '', ln: '', male: false, nc: false, ok: false })
  const [pf, setPf] = useState(null)
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState('')
  const [ov, setOv] = useState(null)
  const [tab, setTab] = useState('up')
  const [openCat, setOpenCat] = useState(null)   // which document row is expanded
  const [idMode, setIdMode] = useState('self')   // ID card: 'self' = I already redacted it / nothing to redact, 'tool' = redact with the tool
  const [idOk, setIdOk] = useState(false)
  const [pwAsk, setPwAsk] = useState(null)       // { file, wrong, res } while a locked PDF waits for its password
  const ask = (file, wrong) => new Promise((res) => setPwAsk({ file, wrong, res }))
  const [scan, setScan] = useState(null)          // { k, d } while the scanner is open (d = file being revised)
  const uid = ses?.user?.id
  const photos = usePhotoUrls(docs)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSes(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSes(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const load = useCallback(async (id) => {
    const a = await supabase.from('candidates').select('*').eq('auth_user_id', id).maybeSingle()
    setC(a.data || null)
    if (a.data) {
      const b = await supabase.from('documents').select('*').eq('candidate_id', a.data.id).order('created_at')
      const all = b.data || []
      setD(all.filter((d) => !d.superseded_at)); setH(all.filter((d) => d.superseded_at))
      const e = await supabase.from('document_events').select('*').eq('candidate_id', a.data.id).order('created_at')
      setEv((e.data || []).filter((x) => x.visible))  // RLS already hides internal notes; double-check here
    }
  }, [])
  useEffect(() => { setC(undefined); setD([]); setH([]); setEv([]); if (uid) load(uid) }, [uid, load])
  // real-time: HR changes a status -> this page refreshes by itself
  useEffect(() => {
    if (!c?.id) return
    const ch = supabase.channel('cand-' + c.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `candidate_id=eq.${c.id}` }, () => load(uid))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'candidates', filter: `id=eq.${c.id}` }, () => load(uid))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [c?.id, uid, load])

  if (ses === undefined) return null
  if (!ses)
    return <LoginScreen role="candidate" />
  const out = <button className="btn sm" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
  if (c === undefined) return <Shell right={out}>กำลังโหลด...</Shell>
  if (c === null) return <Shell right={out}><div className="panel">อีเมลนี้ยังไม่ได้รับเชิญ กรุณาติดต่อ Recruiter</div></Shell>

  async function save(e) {
    e.preventDefault()
    if (!/[A-Za-z]/.test(p.fn) || !/[A-Za-z]/.test(p.ln) || !p.ok) { setErr({ p: 'กรอกชื่อและนามสกุลเป็นภาษาอังกฤษ และติ๊กยินยอมก่อน' }); return }
    const { error } = await supabase.from('candidates').update({ first_name: p.fn.trim(), last_name: p.ln.trim(), is_male: p.male, name_changed: p.nc, consent_at: new Date().toISOString() }).eq('id', c.id)
    if (error) setErr({ p: error.message }); else { setErr({}); load(uid) }
  }

  if (!c.consent_at || !c.first_name)
    return (
      <Shell right={out}>
        <form className="panel" onSubmit={save}>
          <b>ข้อมูลเบื้องต้น</b>
          <div className="hint">ตำแหน่ง {c.position} · SRF {c.srf_no}</div>
          <label className="f">ชื่อ (ภาษาอังกฤษ)<input type="text" value={p.fn} onChange={(e) => setP({ ...p, fn: e.target.value })} /></label>
          <label className="f">นามสกุล (ภาษาอังกฤษ)<input type="text" value={p.ln} onChange={(e) => setP({ ...p, ln: e.target.value })} /></label>
          <label className="f ink"><input type="checkbox" checked={p.male} onChange={(e) => setP({ ...p, male: e.target.checked })} /> เพศชาย (ต้องส่งเอกสารทหาร · ไม่ติ๊กระบบจะบันทึกเป็นเพศหญิง)</label>
          <label className="f ink"><input type="checkbox" checked={p.nc} onChange={(e) => setP({ ...p, nc: e.target.checked })} /> เคยเปลี่ยนชื่อหรือนามสกุล</label>
          <label className="f ink"><input type="checkbox" checked={p.ok} onChange={(e) => setP({ ...p, ok: e.target.checked })} /> ข้าพเจ้ายินยอมให้เก็บและใช้เอกสารและข้อมูลส่วนบุคคลนี้เพื่อตรวจสอบและดำเนินการจ้างงานเท่านั้น</label>
          <div style={{ marginTop: 12 }}><button className="btn pri" type="submit">ถัดไป</button></div>
          {err.p && <div className="err">{err.p}</div>}
        </form>
      </Shell>
    )

  async function saveProfile() {
    if (!/[A-Za-z]/.test(pf.fn) || !/[A-Za-z]/.test(pf.ln)) { setErr({ pf: 'กรอกชื่อและนามสกุลเป็นภาษาอังกฤษ' }); return }
    const { error } = await supabase.from('candidates').update({ first_name: pf.fn.trim(), last_name: pf.ln.trim(), is_male: pf.male, name_changed: pf.nc }).eq('id', c.id)
    if (error) setErr({ pf: error.message }); else { setPf(null); setErr({}); load(uid) }
  }

  const redact = (pages) => new Promise((res) => setOv({ pages, res }))

  // ID card, two ways (redaction is optional): 'self' = the candidate ticks "already redacted / nothing to redact" and uploads as is;
  // 'tool' = redact in the browser (zoom + black bars), the original file is never uploaded
  const idExtra = (key) => (key === '2.1' && idMode !== 'tool' ? { redaction: 'self' } : {})
  async function idJobs(files, bad, jobs) {
    if (idMode !== 'tool') {
      if (files.length > 1) bad.push('บัตรประชาชนส่งครั้งละ 1 ไฟล์ เลือกไฟล์ที่เหลือมาใหม่')
      return genericJobs(C['2.1'], files.slice(0, 1), bad, jobs, ask)
    }
    const f = files[0], x = extOf(f)
    if (files.length > 1) bad.push('บัตรประชาชนปิดบังได้ครั้งละ 1 ไฟล์ เลือกไฟล์ที่เหลือมาใหม่')
    if (f.size > 10485760) { bad.push(f.name + ' ใหญ่เกิน 10 MB'); return }
    let pages = null
    if (x === 'pdf') {
      try {
        const o = await askUntilOpen(f, ask)
        if (o.cancelled || o.failed) { bad.push(f.name + (o.failed ? ' รหัสผ่านไม่ถูกต้อง (ลองได้ 3 ครั้ง)' : ' ข้ามไฟล์นี้ เพราะไม่ได้กรอกรหัสผ่าน')); return }
        const r = await pdfPages(f, 1.6, 5, o.password)
        if (!r.pages) { bad.push('PDF บัตรประชาชนยาวเกินไป (เกิน 5 หน้า)'); return }
        pages = r.pages
      } catch { bad.push('เปิด PDF ไม่ได้ (อาจมีรหัสผ่านหรือไฟล์เสีย) ลองถ่ายรูปบัตรแทน'); return }
    } else if (x === 'jpg' || x === 'png') pages = [await loadImg(f)]
    else { bad.push(f.name + ' ไม่รองรับ (รับ PDF, JPG, PNG)'); return }
    const rects = await redact(pages)
    if (!rects) return
    const blobs = []
    for (let i = 0; i < pages.length; i++) blobs.push(await toJpg(pages[i], rects[i]))
    const boxes = rects.reduce((a, r) => a + r.length, 0)
    jobs.push(x === 'pdf' ? { blob: await mkPdf(blobs), ext: 'pdf', name: f.name, boxes } : { blob: blobs[0], ext: 'jpg', name: f.name, boxes })
  }
  // keep = true when called from the bulk upload so earlier messages are not wiped
  async function up(k, files, keep) {
    const key = k[0], bad = [], jobs = []
    if (key === '2.1' && idMode === 'self' && !idOk) { setErr((e) => ({ ...e, '2.1': 'กรุณาติ๊กยืนยันว่าปิดบังศาสนาและกรุ๊ปเลือดแล้ว (หรือบัตรไม่มีข้อมูลนี้) ก่อนอัปโหลด หรือเลือก "ให้ระบบช่วยปิดบัง"' })); return }
    if (!keep) setErr({})
    setBusy(key)
    try { if (key === '2.1') await idJobs(files, bad, jobs); else await genericJobs(k, files, bad, jobs, ask) }
    catch { bad.push('ประมวลผลไฟล์ไม่ได้ ลองใหม่หรือใช้ไฟล์อื่น') }
    await storeJobs(c.id, key, jobs, bad, idExtra(key))
    setBusy(''); if (bad.length) setErr((e) => ({ ...e, [key]: bad.join(' · ') })); load(uid)
  }
  // bulk: files already sorted into categories by the review step
  async function bulk(list) {
    setErr({}); setBusy('bulk')
    const by = {}
    list.forEach((x) => { (by[x.code] = by[x.code] || []).push(x.file) })
    for (const code of Object.keys(by)) {
      // the ID card tool handles one file at a time
      if (code === '2.1') for (const f of by[code]) await up(C[code], [f], true)
      else await up(C[code], by[code], true)
    }
    setBusy('')
  }
  // photo(s) from the scanner: one page -> JPG when the category takes JPG, otherwise (or several pages) -> one PDF
  async function scanDone(blobs) {
    const { k, d } = scan; setScan(null)
    const file = blobs.length === 1 && k[4].includes('jpg')
      ? new File([blobs[0]], 'scan.jpg', { type: 'image/jpeg' })
      : new File([await mkPdf(blobs)], 'scan.pdf', { type: 'application/pdf' })
    if (d) revise(k, d, [file]); else up(k, [file])
  }
  async function setTitle(d, v) {
    v = v.trim()
    if (v === (d.title || '')) return
    const { error } = await supabase.from('documents').update({ title: v }).eq('id', d.id)
    if (error) setErr((e) => ({ ...e, OT: error.message })); else load(uid)
  }
  // Document revision: the new file replaces the old one, the old one stays in the history
  async function revise(k, d, files) {
    const key = k[0], bad = [], jobs = []
    if (key === '2.1' && idMode === 'self' && !idOk) { setErr({ '2.1': 'กรุณาติ๊กยืนยันว่าปิดบังศาสนาและกรุ๊ปเลือดแล้ว (หรือบัตรไม่มีข้อมูลนี้) ก่อนอัปโหลด หรือเลือก "ให้ระบบช่วยปิดบัง"' }); return }
    setErr({}); setBusy(d.id)
    try { if (key === '2.1') await idJobs(files, bad, jobs); else await genericJobs(k, files.slice(0, 1), bad, jobs, ask) }
    catch { bad.push('ประมวลผลไฟล์ไม่ได้ ลองใหม่หรือใช้ไฟล์อื่น') }
    if (jobs.length) await storeJobs(c.id, key, jobs.slice(0, 1), bad, { replaces: d.id, title: d.title || '', ...idExtra(key) })
    setBusy(''); if (bad.length) setErr((e) => ({ ...e, [key]: bad.join(' · ') })); load(uid)
  }
  async function openFile(d) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60)
    if (data) window.open(data.signedUrl, '_blank')
  }
  async function rm(d) {
    if (!confirm('ลบไฟล์นี้?')) return
    await supabase.storage.from(BUCKET).remove([d.storage_path])
    await supabase.from('documents').delete().eq('id', d.id); load(uid)
  }

  const r = reqd(c), n = r.filter((k) => okCat(docs, c, k)).length
  const miss = r.filter((k) => !okCat(docs, c, k))
  const fixD = docs.filter((d) => d.status === 'fix')
  const next = fixD.length ? { k: C[fixD[0].category], fix: true, why: fixD[0].note || 'HR ขอให้อัปโหลดฉบับแก้ไข' } : miss.length ? { k: miss[0], fix: false, why: miss[0][3] } : null
  const goCat = (code) => { setTab('up'); setOpenCat(code); setTimeout(() => document.getElementById('cat-' + code)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }
  const allCats = req(c)
  const rowOf = (k) => { const l = docs.filter((d) => d.category === k[0]); return { k, l, s: catStatus(l) } }
  const grp = ({ k, s }) => (s === 'revision' || (s === 'missing' && !k[5]) ? 'todo' : s === 'missing' ? 'opt' : s === 'verified' ? 'done' : 'wait')
  const rows = allCats.map(rowOf)
  const GROUPS = [['todo', 'ต้องทำ', 'ส่งเอกสารเหล่านี้ให้ครบ'], ['wait', 'รอ HR ตรวจ', 'ส่งแล้ว ไม่ต้องทำอะไรเพิ่ม'], ['done', 'เรียบร้อย', 'ตรวจผ่านแล้ว'], ['opt', 'ส่งเพิ่มได้ (ไม่บังคับ)', 'ถ้ามีเท่านั้น']]
  const actionTxt = (x) => (x.s === 'revision' ? 'ต้องแก้ไข' : x.s === 'missing' ? (x.k[5] ? 'เพิ่ม' : 'อัปโหลด') : x.s === 'verified' ? 'ตรวจผ่าน' : 'รอตรวจ')
  const catBody = (k, l) => (
    <>
            {k[3] && <div className="hint">{k[3]}</div>}
            {k[0] === 'PH' && <div className="hint">ขนาด 700×900 px · JPG · 300 KB–2 MB · พื้นหลังสีขาวหรือเทาอ่อน · <a href="/photo-spec.jpg" target="_blank" rel="noreferrer">ดูข้อกำหนดรูปถ่ายพนักงาน</a></div>}
            {k[0] === '2.1' && (
              <div>
                <div className={'opt' + (idMode === 'self' ? ' on' : '')} onClick={() => setIdMode('self')}>
                  <label><input type="radio" name="idm" checked={idMode === 'self'} onChange={() => setIdMode('self')} /><b>ฉันปิดบังศาสนาและกรุ๊ปเลือดแล้ว หรือบัตรของฉันไม่มีข้อมูลนี้</b></label>
                  <div className="hint">ทำเองมาแล้ว (เช่น ลบมาจากต้นฉบับ) แค่ติ๊กยืนยัน แล้วอัปโหลดได้เลย</div>
                  {idMode === 'self' && <label className="f ink"><input type="checkbox" checked={idOk} onChange={(e) => setIdOk(e.target.checked)} /> ยืนยันว่าปิดบังแล้ว หรือบัตรไม่มีข้อมูลนี้</label>}
                </div>
                <div className={'opt' + (idMode === 'tool' ? ' on' : '')} onClick={() => setIdMode('tool')}>
                  <label><input type="radio" name="idm" checked={idMode === 'tool'} onChange={() => setIdMode('tool')} /><b>ให้ระบบช่วยปิดบัง (ไม่บังคับ)</b></label>
                  <div className="hint">ซูมเข้าเพื่อลากแถบดำคลุมคำว่า ศาสนา และ หมู่โลหิตได้ละเอียด ไฟล์ต้นฉบับจะไม่ถูกส่งขึ้นระบบ ส่งเฉพาะไฟล์ที่ปิดบังแล้ว</div>
                </div>
              </div>
            )}
            <ul className="files">
              {l.map((d) => (
                <li key={d.id}>
                  <div className="fl"><span>{fname(c, d, docs)} {d.rev > 1 && <span className="tag n">v{d.rev}</span>}</span><span className={'tag ' + DS[docStatus(d)][2]}>{DS[docStatus(d)][0]} · {DS[docStatus(d)][1]}</span></div>
                  <div className="hint">อัปเดต {fdt(d.updated_at || d.created_at)}{d.category === '2.1' && d.redaction ? ' · ' + redactTxt(d) : ''}</div>
                  {d.category === 'OT' && d.status !== 'ok' && (
                    <label className="f">ไฟล์นี้เกี่ยวกับอะไร (จะใช้เป็นชื่อไฟล์) {!d.title && <span className="tag">ยังไม่ได้ตั้งชื่อ</span>}
                      <input type="text" defaultValue={d.title} placeholder="เช่น สรุปสำนวนคดี" maxLength={80} onBlur={(e) => setTitle(d, e.target.value)} />
                    </label>
                  )}
                  {d.status === 'fix' && <div className="err">Revision Required · เหตุผล: {d.note || 'กรุณาอัปโหลดไฟล์ใหม่'}</div>}
                  {d.status === 'ok' && <div className="hint">ตรวจผ่านแล้ว หากต้องการเปลี่ยนไฟล์ กรุณาติดต่อ HR</div>}
                  {d.status !== 'ok' && (
                    <div className="ctl">
                      <label className={'btn sm' + (d.status === 'fix' ? ' pri' : '')} style={{ cursor: 'pointer' }}>{busy === d.id ? 'กำลังประมวลผล...' : 'อัปโหลดฉบับแก้ไข'}
                        <input type="file" hidden disabled={busy === d.id} accept={(k[4].includes('pdf') ? '.pdf,' : '') + '.jpg,.jpeg,.png'} onChange={(e) => { revise(k, d, [...e.target.files]); e.target.value = '' }} />
                      </label>
                      {k[0] !== 'PH' && <button type="button" className="btn sm" disabled={busy === d.id} onClick={() => setScan({ k, d })}>📷 ถ่าย/สแกนฉบับแก้ไข</button>}
                      {!d.replaces && <button className="btn sm" onClick={() => rm(d)}>ลบ</button>}
                    </div>
                  )}
                  {(() => {
                    const chain = chainOf(d, hist), ids = new Set(chain.map((x) => x.id))
                    return (chain.length > 1 || ev.some((e) => ids.has(e.document_id) && e.action !== 'upload')) && (
                      <Fold small title="ประวัติไฟล์และการตรวจสอบ" badge={chain.length > 1 ? <span className="tag n" style={{ marginLeft: 8 }}>{chain.length} เวอร์ชัน</span> : null}>
                        <Versions chain={chain} events={ev} onOpen={(v) => openFile(v)} />
                      </Fold>
                    )
                  })()}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>
              <input type="file" multiple={k[0] !== 'PH' && k[0] !== '2.1'} disabled={busy === k[0] || (k[0] === '2.1' && idMode === 'self' && !idOk)}
                accept={(k[4].includes('pdf') ? '.pdf,' : '') + '.jpg,.jpeg,.png'}
                onChange={(e) => { up(k, [...e.target.files]); e.target.value = '' }} />
              <div className="hint">รับไฟล์ {k[4].includes('pdf') ? 'PDF, JPG, PNG' : 'JPG, PNG'} ไม่เกิน 10 MB{k[0] !== '2.1' && k[4].includes('pdf') && !k[4].includes('jpg') ? ' · รูปที่เลือกพร้อมกันจะรวมเป็น PDF ให้' : ''}{busy === k[0] ? ' · กำลังประมวลผล...' : ''}{k[0] === '2.1' && idMode === 'self' && !idOk ? ' · ติ๊กยืนยันด้านบนก่อนอัปโหลด' : ''}</div>
              <div className="ctl">
                {k[0] === 'PH'
                  ? <label className="btn sm" style={{ cursor: 'pointer' }}>📷 ถ่ายรูปด้วยกล้อง<input type="file" hidden accept="image/*" capture="user" disabled={busy === k[0]} onChange={(e) => { up(k, [...e.target.files]); e.target.value = '' }} /></label>
                  : <button type="button" className="btn sm" disabled={busy === k[0] || (k[0] === '2.1' && idMode === 'self' && !idOk)} onClick={() => setScan({ k })}>📷 ถ่ายรูป / สแกนเอกสาร</button>}
              </div>
              <div className="hint">{k[0] === 'PH' ? 'ไม่มีไฟล์รูปถ่าย? ถ่ายจากกล้องได้เลย ระบบจะตัดเป็น 700×900 ให้' : 'ไม่มีไฟล์? ถ่ายรูปหรือสแกนด้วยมือถือได้เลย ระบบตัดขอบ ปรับให้คมชัด และรวมหลายหน้าเป็น PDF ให้'}</div>
            </div>
            {err[k[0]] && <div className="err">{err[k[0]]}</div>}
    </>
  )
  return (
    <Shell right={out}>
      <section className="hero">
        <div className="pf">
          <div className="pfp">
            {photos[c.id]
              ? <Avatar url={photos[c.id]} name={c.first_name + ' ' + c.last_name} size={84} portrait />
              : <label className="noph" style={{ width: 84, height: 108 }} title="เพิ่มรูปถ่ายพนักงาน">
                  <span>{busy === 'PH' ? 'กำลังอัปโหลด...' : <>เพิ่มรูปถ่าย<br />+</>}</span>
                  <input type="file" hidden accept="image/*" disabled={busy === 'PH'} onChange={(e) => { up(C.PH, [...e.target.files]); e.target.value = '' }} />
                </label>}
            {photos[c.id] && <button type="button" className="cam" aria-label="เปลี่ยนรูปถ่าย" title="เปลี่ยนรูปถ่าย" onClick={() => goCat('PH')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg></button>}
          </div>
          <div className="pfi">
            <div className="eyebrow">สวัสดี</div>
            <h1 className="hello">{c.first_name} {c.last_name}</h1>
            <div className="sub">{c.position}</div>
            <div className="meta"><span className="chip">SRF {c.srf_no}</span><span className="chip">{sexTh(c)}</span>{c.name_changed && <span className="chip">เคยเปลี่ยนชื่อ/นามสกุล</span>}</div>
            {!pf && <button type="button" className="lnk" onClick={() => setPf({ fn: c.first_name, ln: c.last_name, male: c.is_male, nc: c.name_changed })}>แก้ไขข้อมูลของฉัน</button>}
          </div>
          <Ring n={n} total={r.length} />
        </div>
        {pf && (
          <div className="pfe">
            <b>แก้ไขข้อมูลของฉัน</b>
            <div className="hint">ชื่อไฟล์ทั้งหมดและรายการเอกสารที่ต้องส่งจะปรับตามข้อมูลใหม่อัตโนมัติ</div>
            <div className="fgrid">
              <label className="fld"><span className="fl2">ชื่อ (ภาษาอังกฤษ)</span><input type="text" value={pf.fn} onChange={(e) => setPf({ ...pf, fn: e.target.value })} /></label>
              <label className="fld"><span className="fl2">นามสกุล (ภาษาอังกฤษ)</span><input type="text" value={pf.ln} onChange={(e) => setPf({ ...pf, ln: e.target.value })} /></label>
            </div>
            <label className="f ink"><input type="checkbox" checked={pf.male} onChange={(e) => setPf({ ...pf, male: e.target.checked })} /> เพศชาย (ต้องส่งเอกสารทหาร · ไม่ติ๊กระบบจะบันทึกเป็นเพศหญิง)</label>
            <label className="f ink"><input type="checkbox" checked={pf.nc} onChange={(e) => setPf({ ...pf, nc: e.target.checked })} /> เคยเปลี่ยนชื่อหรือนามสกุล</label>
            <div className="ctl"><button className="btn pri" onClick={saveProfile}>บันทึก</button><button className="btn" onClick={() => { setPf(null); setErr({}) }}>ยกเลิก</button></div>
            {err.pf && <div className="err">{err.pf}</div>}
          </div>
        )}
        {next ? (
          <div className={'next' + (next.fix ? ' fix' : '')}>
            <div className="eyebrow">{next.fix ? 'HR ขอให้แก้ไข' : 'ขั้นตอนถัดไป'}</div>
            <div className="nx">{nm(next.k[0])}{next.k[1]} <span className="sub">({next.k[2]})</span></div>
            {next.why && <div className="hint">{next.fix ? 'เหตุผล: ' : ''}{next.why}</div>}
            <div className="ctl"><button type="button" className="btn pri" onClick={() => goCat(next.k[0])}>{next.fix ? 'แก้ไขตอนนี้' : 'เริ่มเลย'}</button>
              {(miss.length + fixD.length) > 1 && <span className="sub">แล้วยังเหลืออีก {miss.length + fixD.length - 1} รายการ</span>}</div>
          </div>
        ) : (
          <div className="next okk"><div className="nx">ส่งเอกสารครบแล้ว ขอบคุณค่ะ/ครับ</div><div className="hint">{rows.every((x) => x.s === 'verified' || x.s === 'missing') ? 'HR ตรวจผ่านครบแล้ว' : 'HR กำลังตรวจสอบ ถ้ามีอะไรต้องแก้ไข จะแจ้งที่หน้านี้'}</div></div>
        )}
      </section>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab !== 'sum'} className={tab !== 'sum' ? 'on' : ''} onClick={() => setTab('up')}>เอกสารของฉัน</button>
        <button type="button" role="tab" aria-selected={tab === 'sum'} className={tab === 'sum' ? 'on' : ''} onClick={() => setTab('sum')}>สถานะและสรุป</button>
      </div>
      {tab === 'sum' ? (
        <>
          <Stepper c={c} docs={docs} />
          <Summary c={c} docs={docs} photo={photos[c.id]} />
        </>
      ) : (
        <>
          <div className="top-up">
            <BulkUpload compact cats={allCats} existing={Object.fromEntries(allCats.map((k) => [k[0], docs.filter((d) => d.category === k[0]).length]))} onConfirm={bulk} busy={!!busy} />
          </div>
          {GROUPS.map(([g, title, sub]) => {
            const list = rows.filter((x) => grp(x) === g)
            if (!list.length) return null
            return (
              <section className="tgroup" key={g}>
                <div className="tgh"><b>{title}</b><span className="n">{list.length}</span><span className="sub">{sub}</span></div>
                {list.map((x) => {
                  const k = x.k, open = openCat === k[0]
                  return (
                    <div className={'tcat ' + x.s + (open ? ' open' : '')} id={'cat-' + k[0]} key={k[0]}>
                      <button type="button" className="tr" aria-expanded={open} onClick={() => setOpenCat(open ? null : k[0])}>
                        <span className="dotc" aria-hidden="true">{x.s === 'verified' ? '✓' : x.s === 'revision' ? '!' : x.s === 'missing' ? '' : '…'}</span>
                        <span className="tt"><b>{nm(k[0])}{k[1]}</b><span className="sub">{k[2]}{x.l.length > 1 ? ' · ' + x.l.length + ' ไฟล์' : ''}</span></span>
                        <span className="tact">{actionTxt(x)}</span>
                        <span className="chev2" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
                      </button>
                      {open && <div className="tb">{catBody(k, x.l)}</div>}
                    </div>
                  )
                })}
              </section>
            )
          })}
          <div className="quiet">
      <div className="guide">
        <Fold title="วิธีใช้งานและเอกสารที่ต้องเตรียม">
          <ol>
            <li>เตรียมไฟล์ PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB ต่อไฟล์ ถ้าไม่มีไฟล์ ให้กด "📷 ถ่ายรูป / สแกนเอกสาร" ในแต่ละหมวด ระบบตัดขอบและรวมเป็น PDF ให้</li>
            <li>อัปโหลดทีละหมวดจากรายการด้านล่าง หรือใช้กล่อง "อัปโหลดหลายไฟล์พร้อมกัน" ด้านบน ระบบจะเดาหมวดให้ และถ้ารวมทุกเอกสารไว้ใน PDF ไฟล์เดียว ระบบจะแยกหน้าให้ แล้วให้ตรวจก่อนยืนยัน</li>
            <li>ทยอยส่งได้ ไม่ต้องส่งครบในครั้งเดียว ไฟล์ที่ส่งแล้วถูกบันทึกไว้</li>
            <li>ดูสถานะที่แต่ละไฟล์ เมื่อ HR ขอให้แก้ไข ให้อ่านเหตุผล แล้วกด "อัปโหลดฉบับแก้ไข" ไฟล์เก่าจะเก็บไว้ในประวัติ</li>
          </ol>
          <div className="leg">
            {Object.keys(DS).map((k) => <span key={k}><span className={'tag ' + DS[k][2]}>{DS[k][0]}</span> {DS[k][1]}</span>)}
          </div>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>เอกสารที่ต้องเตรียม</th><th>ประเภท</th><th>หมายเหตุ</th></tr></thead>
            <tbody>{req(c).map((k) => (
              <tr key={k[0]}>
                <td>{nm(k[0])}{k[1]}<div className="hint">{k[2]}</div></td>
                <td>{k[5] ? <span className="tag n">ไม่บังคับ</span> : <span className="tag">บังคับ</span>}</td>
                <td className="mute">{[k[3], k[0] === '2.2' && 'เพราะคุณเคยเปลี่ยนชื่อหรือนามสกุล', k[0] === '2.5' && 'เพราะเป็นเพศชาย'].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Fold>
      </div>
          </div>
        </>
      )}
      {pwAsk && <PwAsk file={pwAsk.file} wrong={pwAsk.wrong} onDone={(v) => { pwAsk.res(v); setPwAsk(null) }} />}
      {scan && <Scanner onDone={scanDone} onCancel={() => setScan(null)} />}
      {ov && <Redact pages={ov.pages} onCancel={() => { ov.res(null); setOv(null) }} onSave={(rr) => { ov.res(rr); setOv(null) }} />}
    </Shell>
  )
}
