'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { req, reqd, okCat, fname, nm, lbl, fdt } from '../lib/categories'
import { loadImg, toJpg, mkPdf, photoBlob, isLocked } from '../lib/images'
import { pdfPages } from '../lib/pdf'
import OtpLogin from '../components/OtpLogin'
import Redact from '../components/Redact'
import Summary from '../components/Summary'
import Stepper from '../components/Stepper'

const ST = { wait: 'รอตรวจ', ok: 'ผ่านแล้ว', fix: 'ต้องแก้ไข' }
const cls = (s) => (s === 'ok' ? 'ok' : s === 'fix' ? 'bad' : '')
const BUCKET = 'candidate-docs'
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
  const [docs, setD] = useState([])
  const [p, setP] = useState({ fn: '', ln: '', male: false, nc: false, ok: false })
  const [pf, setPf] = useState(null)
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState('')
  const [ov, setOv] = useState(null)
  const [tab, setTab] = useState('up')
  const uid = ses?.user?.id

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
      setD(b.data || [])
    }
  }, [])
  useEffect(() => { setC(undefined); setD([]); if (uid) load(uid) }, [uid, load])
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
    return (
      <Shell>
        <div className="panel"><b style={{ fontSize: 18 }}>ยินดีต้อนรับ</b>
          <div className="hint">กรอกอีเมลที่ได้รับเชิญ เราจะส่งรหัส OTP ให้ แล้วอัปโหลดเอกสารได้ทันที ไม่ต้องส่งครบในครั้งเดียว ทยอยส่งเท่าที่มีได้</div></div>
        <OtpLogin title="เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ" />
        <p style={{ textAlign: 'center', marginTop: 36 }}><a className="mute" href="/staff">สำหรับเจ้าหน้าที่</a></p>
      </Shell>
    )
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
          <label className="f ink"><input type="checkbox" checked={p.male} onChange={(e) => setP({ ...p, male: e.target.checked })} /> เพศชาย (ต้องส่งเอกสารทหาร)</label>
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
  const extOf = (f) => { const e = f.name.split('.').pop().toLowerCase(); return e === 'jpeg' ? 'jpg' : e }

  // ID card: the ONLY path is the redaction tool; the original file is never uploaded
  async function idJobs(files, bad, jobs) {
    const f = files[0], x = extOf(f)
    if (files.length > 1) bad.push('บัตรประชาชนปิดบังได้ครั้งละ 1 ไฟล์ เลือกไฟล์ที่เหลือมาใหม่')
    if (f.size > 10485760) { bad.push(f.name + ' ใหญ่เกิน 10 MB'); return }
    let pages = null
    if (x === 'pdf') {
      try {
        const r = await pdfPages(f)
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
  async function genericJobs(k, files, bad, jobs) {
    const key = k[0], imgs = []
    for (const f of files) {
      const x = extOf(f)
      if (f.size > 10485760) { bad.push(f.name + ' ใหญ่เกิน 10 MB'); continue }
      if (x === 'pdf') {
        if (!k[4].includes('pdf')) { bad.push(f.name + ' หมวดนี้รับเฉพาะรูป JPG หรือ PNG'); continue }
        if (await isLocked(f)) { bad.push(f.name + ' มีรหัสผ่าน กรุณาปลดล็อกก่อนอัปโหลด'); continue }
        jobs.push({ blob: f, ext: 'pdf', name: f.name })
      } else if (x === 'jpg' || x === 'png') imgs.push(f)
      else bad.push(f.name + ' ไม่รองรับ (รับ PDF, JPG, PNG)')
    }
    if (imgs.length && key === 'PH') {
      const r = await photoBlob(await loadImg(imgs[0]))
      jobs.push({ blob: r.blob, ext: 'jpg', name: imgs[0].name }); bad.push(...r.warn)
      if (imgs.length > 1) bad.push('รูปถ่ายใช้ 1 รูป ระบบใช้รูปแรกให้')
    } else if (imgs.length && k[4].includes('jpg')) {
      for (const f of imgs) jobs.push({ blob: await toJpg(await loadImg(f)), ext: 'jpg', name: f.name })
    } else if (imgs.length) {
      const pg = []
      for (const f of imgs) pg.push(await toJpg(await loadImg(f)))
      jobs.push({ blob: await mkPdf(pg), ext: 'pdf', name: 'photos.pdf' })
    }
  }
  async function up(k, files) {
    const key = k[0], bad = [], jobs = []
    setErr({}); setBusy(key)
    try { if (key === '2.1') await idJobs(files, bad, jobs); else await genericJobs(k, files, bad, jobs) }
    catch { bad.push('ประมวลผลไฟล์ไม่ได้ ลองใหม่หรือใช้ไฟล์อื่น') }
    for (const j of jobs) {
      const path = `${c.id}/${key}/${crypto.randomUUID()}.${j.ext}`
      const u = await supabase.storage.from(BUCKET).upload(path, j.blob, { contentType: j.ext === 'pdf' ? 'application/pdf' : 'image/jpeg' })
      if (u.error) { bad.push(j.name + ': ' + u.error.message); continue }
      const row = { candidate_id: c.id, category: key, storage_path: path, original_name: j.name, ext: j.ext, size_kb: Math.max(1, Math.round(j.blob.size / 1024)), status: 'wait', note: '' }
      if (j.boxes) { row.redaction = 'tool'; row.redaction_boxes = j.boxes }
      const r = await supabase.from('documents').insert(row)
      if (r.error) { await supabase.storage.from(BUCKET).remove([path]); bad.push(j.name + ': ' + r.error.message) }
    }
    setBusy(''); if (bad.length) setErr({ [key]: bad.join(' · ') }); load(uid)
  }
  async function rm(d) {
    if (!confirm('ลบไฟล์นี้?')) return
    await supabase.storage.from(BUCKET).remove([d.storage_path])
    await supabase.from('documents').delete().eq('id', d.id); load(uid)
  }

  const r = reqd(c), n = r.filter((k) => okCat(docs, c, k)).length
  const miss = r.filter((k) => !okCat(docs, c, k))
  return (
    <Shell right={out}>
      <Stepper c={c} docs={docs} />
      <div className="panel">
        <div className="bar"><i style={{ width: (r.length ? (n / r.length) * 100 : 0) + '%' }} /></div>
        <div className="sub">ส่งแล้ว {n} จาก {r.length} หมวดที่จำเป็น · ทยอยอัปโหลดได้ ไฟล์ที่ส่งแล้วถูกบันทึกไว้</div>
        {miss.length > 0 && <div className="err">ยังขาดเอกสารบังคับ: {miss.map(lbl).join(' · ')}</div>}
      </div>
      <div className="panel">
        {!pf ? (
          <div className="row" style={{ cursor: 'default' }}>
            <div><b>{c.first_name} {c.last_name}</b><div className="hint">{c.position} · SRF {c.srf_no} · {c.is_male ? 'เพศชาย' : 'ไม่ใช่เพศชาย'}{c.name_changed ? ' · เคยเปลี่ยนชื่อ/นามสกุล' : ''}</div></div>
            <button className="btn sm" onClick={() => setPf({ fn: c.first_name, ln: c.last_name, male: c.is_male, nc: c.name_changed })}>แก้ไขข้อมูลของฉัน</button>
          </div>
        ) : (
          <>
            <b>แก้ไขข้อมูลของฉัน</b>
            <div className="hint">ชื่อไฟล์ทั้งหมดและรายการเอกสารที่ต้องส่งจะปรับตามข้อมูลใหม่อัตโนมัติ</div>
            <label className="f">ชื่อ (ภาษาอังกฤษ)<input type="text" value={pf.fn} onChange={(e) => setPf({ ...pf, fn: e.target.value })} /></label>
            <label className="f">นามสกุล (ภาษาอังกฤษ)<input type="text" value={pf.ln} onChange={(e) => setPf({ ...pf, ln: e.target.value })} /></label>
            <label className="f ink"><input type="checkbox" checked={pf.male} onChange={(e) => setPf({ ...pf, male: e.target.checked })} /> เพศชาย (ต้องส่งเอกสารทหาร)</label>
            <label className="f ink"><input type="checkbox" checked={pf.nc} onChange={(e) => setPf({ ...pf, nc: e.target.checked })} /> เคยเปลี่ยนชื่อหรือนามสกุล</label>
            <div className="ctl"><button className="btn pri" onClick={saveProfile}>บันทึก</button><button className="btn" onClick={() => { setPf(null); setErr({}) }}>ยกเลิก</button></div>
            {err.pf && <div className="err">{err.pf}</div>}
          </>
        )}
      </div>
      <div className="ctl" style={{ marginBottom: 12 }}>
        <button className={'btn' + (tab === 'up' ? ' pri' : '')} onClick={() => setTab('up')}>อัปโหลดเอกสาร</button>
        <button className={'btn' + (tab === 'sum' ? ' pri' : '')} onClick={() => setTab('sum')}>สรุปเอกสาร / สถานะ</button>
      </div>
      {tab === 'sum' ? <Summary c={c} docs={docs} /> : req(c).map((k) => {
        const l = docs.filter((d) => d.category === k[0]), ok = okCat(docs, c, k)
        return (
          <section className={'panel cat' + (ok ? ' done' : '')} key={k[0]}>
            <b>{nm(k[0])}{k[1]}</b> <span className="sub">({k[2]})</span> {k[5] && <span className="tag n">ไม่บังคับ</span>}
            {k[3] && <div className="hint">{k[3]}</div>}
            {k[0] === 'PH' && <div className="hint">ขนาด 700×900 px · JPG · 300 KB–2 MB · พื้นหลังสีขาวหรือเทาอ่อน · <a href="/photo-spec.jpg" target="_blank" rel="noreferrer">ดูข้อกำหนดรูปถ่ายพนักงาน</a></div>}
            {k[0] === '2.1' && <div className="hint">อัปโหลดรูปหรือ PDF แล้วระบบจะเปิดเครื่องมือให้ลากแถบดำปิดศาสนาและหมู่โลหิต ไฟล์ต้นฉบับจะไม่ถูกส่งขึ้นระบบ ส่งเฉพาะไฟล์ที่ปิดบังแล้วเท่านั้น</div>}
            <ul className="files">
              {l.map((d) => (
                <li key={d.id}>
                  <div className="fl"><span>{fname(c, d, docs)}</span><span className={'tag ' + cls(d.status)}>{ST[d.status]}</span></div>
                  <div className="hint">อัปเดต {fdt(d.updated_at || d.created_at)}{d.redaction ? ` · ปิดบังข้อมูลแล้ว ${d.redaction_boxes || ''} จุด` : ''}</div>
                  {d.status === 'fix' && <div className="err">เหตุผล: {d.note || 'กรุณาอัปโหลดไฟล์ใหม่'} · ลบไฟล์นี้แล้วอัปโหลดใหม่</div>}
                  {d.status !== 'ok' && <div className="ctl"><button className="btn sm" onClick={() => rm(d)}>ลบ</button></div>}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>
              <input type="file" multiple={k[0] !== 'PH' && k[0] !== '2.1'} disabled={busy === k[0]}
                accept={(k[4].includes('pdf') ? '.pdf,' : '') + '.jpg,.jpeg,.png'}
                onChange={(e) => { up(k, [...e.target.files]); e.target.value = '' }} />
              <div className="hint">รับไฟล์ {k[4].includes('pdf') ? 'PDF, JPG, PNG' : 'JPG, PNG'} ไม่เกิน 10 MB{k[0] !== '2.1' && k[4].includes('pdf') && !k[4].includes('jpg') ? ' · รูปที่เลือกพร้อมกันจะรวมเป็น PDF ให้' : ''}{busy === k[0] ? ' · กำลังประมวลผล...' : ''}</div>
            </div>
            {err[k[0]] && <div className="err">{err[k[0]]}</div>}
          </section>
        )
      })}
      {ov && <Redact pages={ov.pages} onCancel={() => { ov.res(null); setOv(null) }} onSave={(rr) => { ov.res(rr); setOv(null) }} />}
    </Shell>
  )
}
