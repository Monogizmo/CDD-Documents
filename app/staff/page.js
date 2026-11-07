'use client'
import { useEffect, useState, useCallback } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../lib/supabase'
import { CATS, nm, base, reqd, okCat, fname, lbl, fdt } from '../../lib/categories'
import OtpLogin from '../../components/OtpLogin'
import CodeLogin from '../../components/CodeLogin'
import Summary from '../../components/Summary'
import Stepper from '../../components/Stepper'

const ST = { wait: 'รอตรวจ', ok: 'ผ่านแล้ว', fix: 'ต้องแก้ไข' }
const cls = (s) => (s === 'ok' ? 'ok' : s === 'fix' ? 'bad' : '')
const BUCKET = 'candidate-docs'
const Shell = ({ children, right }) => (
  <>
    <div className="topbar"><div className="topin">
      <div className="brand"><span className="logo">HR</span><div><b>จัดการเอกสารผู้สมัคร</b><div className="sub">Recruiter workspace</div></div></div>
      {right}
    </div></div>
    <div className="wrap wide">{children}</div>
  </>
)

export default function Staff() {
  const [ses, setSes] = useState(undefined)
  const [role, setRole] = useState(null)
  const [cands, setC] = useState([])
  const [docs, setD] = useState([])
  const [sel, setSel] = useState(null)
  const [f, setF] = useState({ srf: '', pos: '', email: '' })
  const [msg, setMsg] = useState('')
  const [flt, setFlt] = useState('all')
  const [viewed, setViewed] = useState({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSes(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSes(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const load = useCallback(async () => {
    const r = await supabase.rpc('my_role')
    setRole(r.data || 'none')
    if (r.data === 'admin' || r.data === 'recruiter') {
      const a = await supabase.from('candidates').select('*').order('created_at', { ascending: false })
      const b = await supabase.from('documents').select('*').order('created_at')
      setC(a.data || []); setD(b.data || [])
    }
  }, [])
  useEffect(() => { if (ses) load() }, [ses, load])
  // real-time: a candidate uploads -> this page refreshes by itself
  useEffect(() => {
    if (!ses) return
    const ch = supabase.channel('staff-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ses, load])

  const out = ses ? <button className="btn sm" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button> : null
  if (ses === undefined) return null
  if (!ses) return <Shell><OtpLogin title="สำหรับเจ้าหน้าที่ HR" /><CodeLogin /></Shell>
  if (role === null) return <Shell right={out}>กำลังโหลด...</Shell>
  if (role !== 'admin' && role !== 'recruiter')
    return <Shell right={out}><div className="panel">อีเมลนี้ยังไม่มีสิทธิ์ใช้งานหน้านี้</div></Shell>

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('candidates').insert({ srf_no: f.srf.trim(), position: f.pos.trim(), email: f.email.trim().toLowerCase() })
    if (error) setMsg(error.message); else { setMsg(''); setF({ srf: '', pos: '', email: '' }); load() }
  }
  async function upd(d, p) {
    const { error } = await supabase.from('documents').update(p).eq('id', d.id)
    setMsg(error ? (/ID card/.test(error.message) ? 'บัตรประชาชนต้องปิดบังข้อมูลด้วยเครื่องมือและผ่านการตรวจของ HR ก่อนอนุมัติ ไฟล์นี้อนุมัติไม่ได้ ให้ตีกลับเพื่ออัปโหลดใหม่' : error.message) : '')
    load()
  }
  async function setStatus(d, v) {
    if (v === 'ok' && d.category === '2.1') {
      if (!viewed[d.id]) { setMsg('กรุณากด "เปิดดู" ตรวจไฟล์บัตรประชาชนฉบับสุดท้ายก่อนอนุมัติ'); return }
      if (!confirm('ยืนยันว่าตรวจไฟล์สุดท้ายแล้ว และไม่พบศาสนาและหมู่โลหิตบนบัตร?')) return
      return upd(d, { status: 'ok', note: '', redaction_checked_at: new Date().toISOString(), redaction_checked_by: ses.user.email })
    }
    return upd(d, { status: v, note: v === 'fix' ? d.note : '', ...(d.category === '2.1' ? { redaction_checked_at: null, redaction_checked_by: null } : {}) })
  }
  async function view(d) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60)
    if (data) { setViewed((v) => ({ ...v, [d.id]: true })); window.open(data.signedUrl, '_blank') }
  }
  async function delDoc(d) {
    if (!confirm('ลบไฟล์นี้?')) return
    await supabase.storage.from(BUCKET).remove([d.storage_path])
    await supabase.from('documents').delete().eq('id', d.id); load()
  }
  async function delCand(c) {
    if (!confirm('ลบแคนดิเดตและไฟล์ทั้งหมด? ย้อนกลับไม่ได้')) return
    const p = docs.filter((d) => d.candidate_id === c.id).map((d) => d.storage_path)
    if (p.length) await supabase.storage.from(BUCKET).remove(p)
    await supabase.from('candidates').delete().eq('id', c.id); setSel(null); load()
  }
  async function stage(c, col) { await supabase.from('candidates').update({ [col]: c[col] ? null : new Date().toISOString() }).eq('id', c.id); load() }
  async function zip(c) {
    // only approved files; an ID card additionally needs the redaction tool + HR check
    const ok = docs.filter((d) => d.candidate_id === c.id && d.status === 'ok' && (d.category !== '2.1' || (d.redaction === 'tool' && d.redaction_checked_at)))
    if (!ok.length) { setMsg('ยังไม่มีไฟล์ที่ตรวจ "ผ่านแล้ว"'); return }
    setMsg('กำลังรวมไฟล์...')
    const z = new JSZip()
    for (const d of ok) {
      const { data } = await supabase.storage.from(BUCKET).download(d.storage_path)
      if (data) z.file(fname(c, d, ok), data)
    }
    const b = await z.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `SRF ${c.srf_no.replace(/[\\/:*?"<>|]/g, '-')} - ${base(c)}.zip`
    a.click(); setMsg('')
  }

  const info = cands.map((c) => {
    const m = docs.filter((d) => d.candidate_id === c.id), r = reqd(c)
    return { c, m, n: r.length, miss: r.filter((k) => !okCat(m, c, k)), w: m.filter((d) => d.status === 'wait').length, x: m.filter((d) => d.status === 'fix').length }
  })
  const list = info.filter((i) => flt === 'all' || (flt === 'miss' && i.miss.length) || (flt === 'wait' && i.w) || (flt === 'fix' && i.x) || (flt === 'done' && !i.miss.length))
  return (
    <Shell right={out}>
      <div className="kpis">
        <div className="kpi"><span className="sub">ผู้สมัครทั้งหมด</span><b>{cands.length}</b></div>
        <div className="kpi"><span className="sub">ส่งเอกสารบังคับครบ</span><b>{info.filter((i) => !i.miss.length).length}</b></div>
        <div className="kpi"><span className="sub">ไฟล์รอตรวจ</span><b>{docs.filter((d) => d.status === 'wait').length}</b></div>
        <div className="kpi"><span className="sub">ไฟล์ต้องแก้ไข</span><b>{docs.filter((d) => d.status === 'fix').length}</b></div>
      </div>
      <form className="panel" onSubmit={add}>
        <b>เพิ่มแคนดิเดต</b>
        <div className="grid3">
          <label className="f">อีเมลแคนดิเดต<input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="f">เลข SRF<input type="text" value={f.srf} placeholder="002/2026" onChange={(e) => setF({ ...f, srf: e.target.value })} /></label>
          <label className="f">ชื่อตำแหน่ง<input type="text" value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value })} /></label>
        </div>
        <div style={{ marginTop: 12 }}><button className="btn pri" type="submit">เพิ่ม</button></div>
      </form>
      <div className="ctl" style={{ marginBottom: 12 }}>
        <select value={flt} onChange={(e) => setFlt(e.target.value)} aria-label="กรอง">
          <option value="all">ทั้งหมด</option><option value="miss">ยังขาดเอกสารบังคับ</option><option value="wait">มีไฟล์รอตรวจ</option>
          <option value="fix">มีไฟล์ต้องแก้ไข</option><option value="done">ส่งครบแล้ว</option>
        </select>
      </div>
      {msg && <div className="err" style={{ marginBottom: 10 }}>{msg}</div>}
      {!list.length && <div className="panel">ไม่พบแคนดิเดตตามเงื่อนไข</div>}
      {list.map(({ c, m, n, miss, w, x }) => {
        const open = sel === c.id
        return (
          <section className="panel" key={c.id}>
            <div className="row" onClick={() => setSel(open ? null : c.id)}>
              <div><b>{base(c)}</b><div className="sub">{c.position} · SRF {c.srf_no} · {c.email}</div></div>
              <div style={{ textAlign: 'right' }}>
                <span className={'tag ' + (miss.length ? '' : 'ok')}>ส่งแล้ว {n - miss.length}/{n}</span>{' '}
                {w > 0 && <span className="tag n">รอตรวจ {w}</span>}{' '}{x > 0 && <span className="tag bad">แก้ไข {x}</span>}
              </div>
            </div>
            {miss.length > 0 && <div className="err">ยังขาด (บังคับ): {miss.map(lbl).join(' · ')}</div>}
            {open && (
              <>
                <div style={{ marginTop: 12 }}><Stepper c={c} docs={docs} /></div>
                <Summary c={c} docs={docs} />
                <ul className="files">
                  {!m.length && <li>ยังไม่มีไฟล์</li>}
                  {m.map((d) => (
                    <li key={d.id}>
                      <div className="fl"><span>{fname(c, d, m)}</span><span className={'tag ' + cls(d.status)}>{ST[d.status]}</span></div>
                      <div className="hint">อัปเดต {fdt(d.updated_at)}
                        {d.category === '2.1' && (d.redaction === 'tool' ? ` · ปิดบังด้วยเครื่องมือ ${d.redaction_boxes || ''} จุด${d.redaction_checked_at ? ' · HR ตรวจแล้ว (' + d.redaction_checked_by + ')' : ' · รอ HR ตรวจไฟล์สุดท้าย'}` : ' · ไม่ผ่านเครื่องมือปิดบัง อนุมัติไม่ได้')}</div>
                      <div className="ctl">
                        <button className="btn sm" onClick={() => view(d)}>เปิดดู</button>
                        <select value={d.status} onChange={(e) => setStatus(d, e.target.value)}>
                          {Object.keys(ST).map((s) => <option key={s} value={s}>{ST[s]}</option>)}
                        </select>
                        <select value={d.category} onChange={(e) => upd(d, { category: e.target.value })}>
                          {CATS.map((k) => <option key={k[0]} value={k[0]}>ย้ายไป {nm(k[0])}{k[1]}</option>)}
                        </select>
                        <button className="btn sm" onClick={() => delDoc(d)}>ลบ</button>
                      </div>
                      {d.status === 'fix' && <input type="text" defaultValue={d.note} placeholder="เหตุผลที่ต้องแก้ไข (แคนดิเดตจะเห็น)" onBlur={(e) => upd(d, { note: e.target.value })} />}
                    </li>
                  ))}
                </ul>
                <div className="ctl" style={{ marginTop: 12 }}>
                  <button className="btn pri" onClick={() => zip(c)}>โหลดทั้งชุด (Zip) เฉพาะที่ผ่านแล้ว</button>
                  <button className="btn" onClick={() => stage(c, 'signed_at')}>{c.signed_at ? 'ยกเลิก: เซ็นเอกสารแล้ว' : 'ทำเครื่องหมาย: เซ็นเอกสารแล้ว'}</button>
                  <button className="btn" onClick={() => stage(c, 'ready_at')}>{c.ready_at ? 'ยกเลิก: พร้อมเริ่มงาน' : 'ทำเครื่องหมาย: พร้อมเริ่มงาน'}</button>
                  <button className="btn" onClick={() => delCand(c)}>ลบแคนดิเดต</button>
                </div>
              </>
            )}
          </section>
        )
      })}
    </Shell>
  )
}
