'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { req, reqd, okCat, fname, nm, lbl } from '../lib/categories'
import Summary from '../components/Summary'
import OtpLogin from '../components/OtpLogin'
import Redact from '../components/Redact'
import { loadImg, toJpg, mkPdf, photoBlob, isLocked } from '../lib/images'

const ST = { wait: 'รอตรวจ', ok: 'ผ่านแล้ว', fix: 'ต้องแก้ไข' }
const BUCKET = 'candidate-docs'
const Shell = ({ children }) => (
  <div className="wrap">
    <header><h1>Candidate Document Portal</h1><div className="sub">อัปโหลดเอกสารสำหรับการจ้างงานของคุณ</div></header>
    {children}
  </div>
)

export default function Home() {
  const [ses, setSes] = useState(undefined)
  const [c, setC] = useState(undefined)
  const [docs, setD] = useState([])
  const [p, setP] = useState({ fn: '', ln: '', male: false, nc: false, ok: false })
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

  if (ses === undefined) return null
  if (!ses)
    return (
      <Shell>
        <div className="panel"><b style={{ fontSize: 17 }}>ยินดีต้อนรับ</b>
          <div className="hint">กรอกอีเมลที่ได้รับเชิญ เราจะส่งรหัส OTP ให้ แล้วอัปโหลดเอกสารได้ทันที ไม่ต้องส่งครบในครั้งเดียว ทยอยส่งเท่าที่มีได้</div></div>
        <OtpLogin title="เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ" />
        <p style={{ textAlign: 'center', marginTop: 36 }}><a className="mute" href="/staff">สำหรับเจ้าหน้าที่</a></p>
      </Shell>
    )
  const out = <p className="mute" style={{ textAlign: 'center', marginTop: 24 }}><a href="#" onClick={(e) => { e.preventDefault(); supabase.auth.signOut() }}>ออกจากระบบ</a></p>
  if (c === undefined) return <Shell>กำลังโหลด...</Shell>
  if (c === null) return <Shell><div className="panel">อีเมลนี้ยังไม่ได้รับเชิญ กรุณาติดต่อ Recruiter</div>{out}</Shell>

  async function save(e) {
    e.preventDefault()
    if (!/[A-Za-z]/.test(p.fn) || !/[A-Za-z]/.test(p.ln) || !p.ok) { setErr({ p: 'กรอกชื่อและนามสกุลเป็นภาษาอังกฤษ และติ๊กยินยอมก่อน' }); return }
    const { error } = await supabase.from('candidates').update({ first_name: p.fn.trim(), last_name: p.ln.trim(), is_male: p.male, name_changed: p.nc, consent_at: new Date().toISOString() }).eq('id', c.id)
    if (error) setErr({ p: error.message }); else { setErr({}); load(uid) }
  }

  if (!c.consent_at || !c.first_name)
    return (
      <Shell>
        <form className="panel" onSubmit={save}>
          <b>ข้อมูลเบื้องต้น</b>
          <div className="hint">ตำแหน่ง {c.position} · SRF {c.srf_no}</div>
          <label className="f">ชื่อ (ภาษาอังกฤษ)<input type="text" value={p.fn} onChange={(e) => setP({ ...p, fn: e.target.value })} /></label>
          <label className="f">นามสกุล (ภาษาอังกฤษ)<input type="text" value={p.ln} onChange={(e) => setP({ ...p, ln: e.target.value })} /></label>
          <label className="f"><input type="checkbox" checked={p.male} onChange={(e) => setP({ ...p, male: e.target.checked })} /> เพศชาย (ต้องส่งเอกสารทหาร)</label>
          <label className="f"><input type="checkbox" checked={p.nc} onChange={(e) => setP({ ...p, nc: e.target.checked })} /> เคยเปลี่ยนชื่อหรือนามสกุล</label>
          <label className="f" style={{ color: 'var(--ink)' }}><input type="checkbox" checked={p.ok} onChange={(e) => setP({ ...p, ok: e.target.checked })} /> ข้าพเจ้ายินยอมให้เก็บและใช้เอกสารและข้อมูลส่วนบุคคลนี้เพื่อตรวจสอบและดำเนินการจ้างงานเท่านั้น</label>
          <div style={{ marginTop: 12 }}><button className="btn pri" type="submit">ถัดไป</button></div>
          {err.p && <div className="err">{err.p}</div>}
        </form>
        {out}
      </Shell>
    )

  const redact = (img) => new Promise((res) => setOv({ img, res }))
  async function up(k, files) {
    const key = k[0], bad = [], jobs = [], imgs = []
    setErr({}); setBusy(key)
    for (const f of files) {
      const e = f.name.split('.').pop().toLowerCase(), x = e === 'jpeg' ? 'jpg' : e
      if (f.size > 10485760) { bad.push(f.name + ' ใหญ่เกิน 10 MB'); continue }
      if (x === 'pdf') {
        if (!k[4].includes('pdf')) { bad.push(f.name + ' หมวดนี้รับเฉพาะรูป JPG หรือ PNG'); continue }
        if (await isLocked(f)) { bad.push(f.name + ' มีรหัสผ่าน กรุณาปลดล็อกก่อนอัปโหลด'); continue }
        jobs.push({ blob: f, ext: 'pdf', name: f.name })
      } else if (x === 'jpg' || x === 'png') imgs.push(f)
      else bad.push(f.name + ' ไม่รองรับ (รับ PDF, JPG, PNG)')
    }
    try {
      if (imgs.length && key === '2.1') {
        const im = await loadImg(imgs[0]), rects = await redact(im)
        if (rects) jobs.push({ blob: await toJpg(im, rects), ext: 'jpg', name: imgs[0].name, red: true })
        if (imgs.length > 1) bad.push('บัตรประชาชนปิดบังได้ครั้งละ 1 รูป เลือกรูปที่เหลือมาปิดบังใหม่')
      } else if (imgs.length && key === 'PH') {
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
    } catch { bad.push('เปิดรูปไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG') }
    for (const j of jobs) {
      const path = `${c.id}/${key}/${crypto.randomUUID()}.${j.ext}`
      const u = await supabase.storage.from(BUCKET).upload(path, j.blob, { contentType: j.ext === 'pdf' ? 'application/pdf' : 'image/jpeg' })
      if (u.error) { bad.push(j.name + ': ' + u.error.message); continue }
      const r = await supabase.from('documents').insert({ candidate_id: c.id, category: key, storage_path: path, original_name: j.name, ext: j.ext, size_kb: Math.max(1, Math.round(j.blob.size / 1024)), status: 'wait', note: '' })
      if (r.error) { await supabase.storage.from(BUCKET).remove([path]); bad.push(j.name + ': ' + r.error.message) }
      else if (j.red) await supabase.from('candidates').update({ id_redacted: true }).eq('id', c.id)
    }
    setBusy(''); if (bad.length) setErr({ [key]: bad.join(' · ') }); load(uid)
  }
  async function rm(d) {
    if (!confirm('ลบไฟล์นี้?')) return
    await supabase.storage.from(BUCKET).remove([d.storage_path])
    await supabase.from('documents').delete().eq('id', d.id); load(uid)
  }
  async function setRed(v) { await supabase.from('candidates').update({ id_redacted: v }).eq('id', c.id); load(uid) }

  const r = reqd(c), n = r.filter((k) => okCat(docs, c, k)).length
  const miss = r.filter((k) => !okCat(docs, c, k))
  return (
    <Shell>
      <div className="panel">
        <div className="bar"><i style={{ width: (r.length ? (n / r.length) * 100 : 0) + '%' }} /></div>
        <div className="sub">ส่งแล้ว {n} จาก {r.length} หมวดที่จำเป็น · ทยอยอัปโหลดได้ ไฟล์ที่ส่งแล้วถูกบันทึกไว้</div>
        <div className="hint">{c.position} · SRF {c.srf_no}</div>
        {miss.length > 0 && <div className="err">ยังขาดเอกสารบังคับ: {miss.map(lbl).join(' · ')}</div>}
      </div>
      <div className="ctl" style={{ marginBottom: 12 }}>
        <button className={'btn' + (tab === 'up' ? ' pri' : '')} onClick={() => setTab('up')}>อัปโหลดเอกสาร</button>
        <button className={'btn' + (tab === 'sum' ? ' pri' : '')} onClick={() => setTab('sum')}>สรุปเอกสาร</button>
      </div>
      {tab === 'sum' ? <Summary c={c} docs={docs} /> : req(c).map((k) => {
        const l = docs.filter((d) => d.category === k[0]), ok = okCat(docs, c, k)
        return (
          <section className={'panel cat' + (ok ? ' done' : '')} key={k[0]}>
            <b>{nm(k[0])}{k[1]}</b> <span className="sub">({k[2]})</span>
            {k[5] && <span className="tag">ไม่บังคับ</span>}
            {k[3] && <div className="hint">{k[3]}</div>}
            {k[0] === 'PH' && <div className="hint">ขนาด 700×900 px · JPG · 300 KB–2 MB · พื้นหลังสีขาวหรือเทาอ่อน · <a href="/photo-spec.jpg" target="_blank" rel="noreferrer">ดูข้อกำหนดรูปถ่ายพนักงาน</a></div>}
            {k[0] === '2.1' && <label className="f" style={{ color: 'var(--ink)' }}><input type="checkbox" checked={!!c.id_redacted} onChange={(e) => setRed(e.target.checked)} /> ฉันลบศาสนาและกรุ๊ปเลือดออกจากไฟล์แล้ว</label>}
            <ul className="files">
              {l.map((d) => (
                <li key={d.id}>
                  {fname(c, d, docs)} <span className={'tag ' + (d.status === 'ok' ? 'ok' : d.status === 'fix' ? 'bad' : '')}>{ST[d.status]}</span>
                  {d.status !== 'ok' && <> <button className="btn" onClick={() => rm(d)}>ลบ</button></>}
                  {d.status === 'fix' && <div className="err">เหตุผล: {d.note || 'กรุณาอัปโหลดไฟล์ใหม่'} · ลบไฟล์นี้แล้วอัปโหลดใหม่</div>}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>
              <input type="file" multiple={k[0] !== 'PH'} disabled={busy === k[0]}
                accept={(k[4].includes('pdf') ? '.pdf,' : '') + '.jpg,.jpeg,.png'}
                onChange={(e) => { up(k, [...e.target.files]); e.target.value = '' }} />
              <div className="hint">รับไฟล์ {k[4].includes('pdf') ? 'PDF, JPG, PNG' : 'JPG, PNG'} ไม่เกิน 10 MB{k[0] === '2.1' ? ' · รูปจะเปิดเครื่องมือปิดบังข้อมูลให้' : k[4].includes('pdf') && !k[4].includes('jpg') ? ' · รูปที่เลือกพร้อมกันจะรวมเป็น PDF ให้' : ''}{busy === k[0] ? ' · กำลังอัปโหลด...' : ''}</div>
            </div>
            {err[k[0]] && <div className="err">{err[k[0]]}</div>}
          </section>
        )
      })}
      {out}
      {ov && <Redact img={ov.img} onCancel={() => { ov.res(null); setOv(null) }} onSave={(r) => { ov.res(r); setOv(null) }} />}
    </Shell>
  )
}
