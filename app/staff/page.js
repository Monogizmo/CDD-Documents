'use client'
import { useEffect, useState, useCallback } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../lib/supabase'
import { CATS, RCATS, RC, C, isR, AOU, REHIRE, rlbl, rreq, rreqd, okR, nm, base, reqd, okCat, fname, lbl, fdt } from '../../lib/categories'
import { BUCKET, genericJobs, storeJobs } from '../../lib/upload'
import { parseAou, parseRehire } from '../../lib/classify'
import OtpLogin from '../../components/OtpLogin'
import CodeLogin from '../../components/CodeLogin'
import Summary from '../../components/Summary'
import Stepper from '../../components/Stepper'
import BulkUpload from '../../components/BulkUpload'
import Avatar from '../../components/Avatar'
import Dashboard from '../../components/Dashboard'
import { usePhotoUrls } from '../../lib/photos'
import { stageOf, STAGE_NAME } from '../../lib/stage'

const ST = { wait: 'รอตรวจ', ok: 'ผ่านแล้ว', fix: 'ต้องแก้ไข' }
const cls = (s) => (s === 'ok' ? 'ok' : s === 'fix' ? 'bad' : '')
const Shell = ({ children, right }) => (
  <>
    <div className="topbar"><div className="topin">
      <div className="brand"><span className="logo">HR</span><div><b>จัดการเอกสารผู้สมัคร</b><div className="sub">Recruiter workspace</div></div></div>
      {right}
    </div></div>
    <div className="wrap xl">{children}</div>
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
  const [bz, setBz] = useState('')
  const [pg, setPg] = useState('dash')
  const photos = usePhotoUrls(docs)

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
      const k = await supabase.from('candidate_checks').select('*')
      const ck = Object.fromEntries((k.data || []).map((x) => [x.candidate_id, x]))
      setC((a.data || []).map((x) => ({ ...x, aou_status: ck[x.id]?.aou_status || null, rehire_status: ck[x.id]?.rehire_status || null })))
      setD(b.data || [])
    }
  }, [])
  useEffect(() => { if (ses) load() }, [ses, load])
  // real-time: a candidate uploads -> this page refreshes by itself
  useEffect(() => {
    if (!ses) return
    const ch = supabase.channel('staff-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_checks' }, () => load())
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
    const ok = docs.filter((d) => d.candidate_id === c.id && d.status === 'ok' && (d.category !== '2.1' || (d.redaction === 'tool' && d.redaction_checked_at)) && (d.category !== 'RHD' || c.rehire_status === 'rehire'))
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

  // ---- recruiter-side checklist ----
  async function setCheck(c, patch) {
    const { error } = await supabase.from('candidate_checks').upsert({ candidate_id: c.id, ...patch }, { onConflict: 'candidate_id' })
    setMsg(error ? error.message : ''); load()
  }
  async function upR(c, k, files, keep) {
    const bad = [], jobs = []
    if (!keep) setMsg('')
    setBz(c.id + k[0])
    try { await genericJobs(k, files, bad, jobs) } catch { bad.push('ประมวลผลไฟล์ไม่ได้ ลองใหม่หรือใช้ไฟล์อื่น') }
    const old = docs.filter((d) => d.candidate_id === c.id && d.category === k[0])
    // recruiter-side files need no review step, so they are stored as already approved (they go into the Zip)
    const n = await storeJobs(c.id, k[0], jobs, bad, { status: 'ok' })
    if (n && k[0] !== 'ROT' && old.length) {  // one file per category: the new one replaces the old one
      await supabase.storage.from(BUCKET).remove(old.map((d) => d.storage_path))
      await supabase.from('documents').delete().in('id', old.map((d) => d.id))
    }
    setBz(''); if (bad.length) setMsg((m) => (keep && m ? m + ' · ' : '') + bad.join(' · ')); load()
  }
  async function bulkR(c, list) {
    setMsg(''); setBz('bulk' + c.id)
    const by = {}
    list.forEach((x) => { (by[x.code] = by[x.code] || []).push(x.file) })
    // status can be read from names like "1-5. AOU (B But Clear) - ..." when it has not been chosen yet
    const patch = {}
    if (by.AOU && !c.aou_status) { const v = parseAou(by.AOU[0].name); if (v) patch.aou_status = v }
    if (by.RHC && !c.rehire_status) { const v = parseRehire(by.RHC[0].name); if (v) patch.rehire_status = v }
    if (Object.keys(patch).length) await setCheck(c, patch)
    for (const code of Object.keys(by)) await upR(c, RC[code], by[code], true)
    setBz('')
  }

  function openCand(c) {
    setPg('cands'); setFlt('all'); setSel(c.id)
    setTimeout(() => document.getElementById('cand-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }
  const nameOf = (c) => (c.first_name ? base(c) : c.email)

  const info = cands.map((c) => {
    const all = docs.filter((d) => d.candidate_id === c.id), m = all.filter((d) => !isR(d.category)), mr = all.filter((d) => isR(d.category)), r = reqd(c), rr = rreqd(c)
    return { c, m, mr, stage: stageOf(c, all), n: r.length, miss: r.filter((k) => !okCat(m, c, k)), rn: rr.length, rmiss: rr.filter((k) => !okR(mr, c, k)), w: m.filter((d) => d.status === 'wait').length, x: m.filter((d) => d.status === 'fix').length }
  })
  const list = info.filter((i) => flt === 'all' || (flt === 'miss' && i.miss.length) || (flt === 'wait' && i.w) || (flt === 'fix' && i.x) || (flt === 'rmiss' && i.rmiss.length) || (flt === 'done' && !i.miss.length))
  const Ic = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  return (
    <Shell right={out}>
      <div className="app">
        <nav className="side" aria-label="เมนู">
          <button type="button" className={'nav' + (pg === 'dash' ? ' on' : '')} onClick={() => setPg('dash')}><Ic d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />Dashboard</button>
          <button type="button" className={'nav' + (pg === 'cands' ? ' on' : '')} onClick={() => setPg('cands')}><Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />แคนดิเดต</button>
        </nav>
        <div className="main">
      {msg && <div className="err" style={{ marginBottom: 10 }}>{msg}</div>}
      {pg === 'dash' && (<><h1 className="pgt">Dashboard</h1><Dashboard rows={info} photos={photos} onOpen={openCand} onZip={zip} /></>)}
      {pg === 'cands' && (<>
      <h1 className="pgt">แคนดิเดต</h1>
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
          <option value="fix">มีไฟล์ต้องแก้ไข</option><option value="rmiss">ฝั่ง Recruiter ยังไม่ครบ</option><option value="done">ส่งครบแล้ว</option>
        </select>
      </div>
      {!list.length && <div className="panel">ไม่พบแคนดิเดตตามเงื่อนไข</div>}
      {list.map(({ c, m, mr, n, miss, rn, rmiss, w, x }) => {
        const open = sel === c.id
        return (
          <section className="panel" key={c.id} id={'cand-' + c.id}>
            <div className="row" onClick={() => setSel(open ? null : c.id)}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <Avatar url={photos[c.id]} name={c.first_name ? base(c) : ''} size={46} />
                <div style={{ minWidth: 0 }}><b>{base(c)}</b><div className="sub">{c.position} · SRF {c.srf_no} · {c.email}</div></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={'tag ' + (miss.length ? '' : 'ok')}>แคนดิเดตส่งแล้ว {n - miss.length}/{n}</span>{' '}
                <span className={'tag ' + (rmiss.length ? '' : 'ok')}>Recruiter {rn - rmiss.length}/{rn}</span>{' '}
                {w > 0 && <span className="tag n">รอตรวจ {w}</span>}{' '}{x > 0 && <span className="tag bad">แก้ไข {x}</span>}
              </div>
            </div>
            {miss.length > 0 && <div className="err">แคนดิเดตยังขาด (บังคับ): {miss.map(lbl).join(' · ')}</div>}
            {rmiss.length > 0 && <div className="err">ฝั่ง Recruiter ยังขาด (บังคับ): {rmiss.map(rlbl).join(' · ')}</div>}
            {open && (
              <>
                <div className="srf">
                  <Avatar url={photos[c.id]} name={c.first_name ? base(c) : ''} size={96} portrait />
                  <div style={{ minWidth: 0 }}>
                    <div className="sub">SRF {c.srf_no}</div>
                    <div className="nm">{c.first_name ? base(c) : 'ยังไม่ได้กรอกชื่อ'}</div>
                    <div className="sub">{c.position} · {c.email}</div>
                    <div className="meta">
                      <span className="tag n">{STAGE_NAME[stageOf(c, [...m, ...mr])]}</span>
                      {!photos[c.id] && <span className="tag">ยังไม่มีรูปถ่าย</span>}
                      {m.some((d) => d.category === 'PH' && d.status === 'wait') && <span className="tag">รูปรอตรวจ</span>}
                      {m.some((d) => d.category === 'PH' && d.status === 'fix') && <span className="tag bad">รูปต้องแก้ไข</span>}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}><Stepper c={c} docs={docs} /></div>
                <Summary c={c} docs={docs} photo={photos[c.id]} />
                <div className="panel" style={{ marginTop: 14 }}>
                  <b style={{ fontSize: 16 }}>Checklist เอกสารฝั่ง Recruiter</b>
                  <div className="hint">ไฟล์ PDF ทั้งหมด · แคนดิเดตมองไม่เห็นส่วนนี้ · ไฟล์จะรวมอยู่ใน Zip ให้ Hiring โหลดได้ทีเดียว</div>
                  <div style={{ marginTop: 10 }}>
                    <BulkUpload cats={RCATS} existing={Object.fromEntries(RCATS.map((k) => [k[0], mr.filter((d) => d.category === k[0]).length]))} onConfirm={(l) => bulkR(c, l)} busy={bz === 'bulk' + c.id} />
                  </div>
                  {rreq(c, mr).map((k) => {
                    const l = mr.filter((d) => d.category === k[0]), ok = okR(mr, c, k), need = !k[5] && (k[0] !== 'RHD' || c.rehire_status === 'rehire')
                    const unused = k[0] === 'RHD' && c.rehire_status !== 'rehire'
                    return (
                      <section className={'panel cat' + (ok ? ' done' : need ? ' need' : '')} key={k[0]} style={{ boxShadow: 'none', marginBottom: 10 }}>
                        <div className="chk"><i>{ok ? '✅' : '⬜'}</i><b>{rlbl(k)}</b> <span className={'tag ' + (need ? '' : 'n')}>{need ? 'บังคับ' : 'ไม่บังคับ'}</span></div>
                        {k[3] && <div className="hint">{k[3]}</div>}
                        {k[0] === 'AOU' && (
                          <div className="ctl">
                            <select value={c.aou_status || ''} onChange={(e) => setCheck(c, { aou_status: e.target.value || null })}>
                              <option value="">— เลือกสถานะ AOU —</option>
                              {Object.keys(AOU).map((v) => <option key={v} value={v}>{AOU[v]}</option>)}
                            </select>
                            {!c.aou_status && <span className="err">ยังไม่ได้เลือกสถานะ</span>}
                          </div>
                        )}
                        {k[0] === 'RHC' && (
                          <div className="ctl">
                            <select value={c.rehire_status || ''} onChange={(e) => setCheck(c, { rehire_status: e.target.value || null })}>
                              <option value="">— เลือกสถานะ Rehire —</option>
                              {Object.keys(REHIRE).map((v) => <option key={v} value={v}>{REHIRE[v]}</option>)}
                            </select>
                            {!c.rehire_status && <span className="err">ยังไม่ได้เลือกสถานะ</span>}
                          </div>
                        )}
                        {k[0] === 'EML' && c.aou_status === 'b_clear' && !l.length && <div className="hint" style={{ color: 'var(--warn)' }}>ผล AOU เป็น B But Clear แนะนำให้แนบอีเมลยืนยัน</div>}
                        {unused && <div className="err">ตอนนี้เลือก New Hire จึงไม่ถูกนับและไม่รวมใน Zip ลบไฟล์นี้ หรือเปลี่ยนสถานะกลับเป็น Rehire</div>}
                        <ul className="files">
                          {l.map((d) => (
                            <li key={d.id}>
                              <div className="fl"><span>{fname(c, d, l)}</span></div>
                              <div className="hint">อัปเดต {fdt(d.updated_at || d.created_at)}</div>
                              <div className="ctl">
                                <button className="btn sm" onClick={() => view(d)}>เปิดดู</button>
                                <select value={d.category} onChange={(e) => upd(d, { category: e.target.value })}>
                                  {RCATS.map((x) => <option key={x[0]} value={x[0]}>ย้ายไป {rlbl(x)}</option>)}
                                </select>
                                <button className="btn sm" onClick={() => delDoc(d)}>ลบ</button>
                              </div>
                              {d.category === 'ROT' && <input type="text" defaultValue={d.title} placeholder="ไฟล์นี้เกี่ยวกับอะไร (ใช้เป็นชื่อไฟล์) เช่น สรุปสำนวนคดี" maxLength={80} onBlur={(e) => e.target.value.trim() !== (d.title || '') && upd(d, { title: e.target.value.trim() })} />}
                            </li>
                          ))}
                        </ul>
                        <div style={{ marginTop: 8 }}>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple={k[0] === 'ROT'} disabled={bz === c.id + k[0]}
                            onChange={(e) => { upR(c, k, [...e.target.files]); e.target.value = '' }} />
                          <div className="hint">{l.length && k[0] !== 'ROT' ? 'เลือกไฟล์ใหม่เพื่อแทนที่ไฟล์เดิม' : 'PDF ไม่เกิน 10 MB'}{bz === c.id + k[0] ? ' · กำลังอัปโหลด...' : ''}</div>
                        </div>
                      </section>
                    )
                  })}
                </div>
                <b>เอกสารที่แคนดิเดตส่ง</b>
                <ul className="files">
                  {!m.length && <li>ยังไม่มีไฟล์จากแคนดิเดต</li>}
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
                      {d.category === 'OT' && <input type="text" defaultValue={d.title} placeholder="ไฟล์นี้เกี่ยวกับอะไร (ใช้เป็นชื่อไฟล์) เช่น สรุปสำนวนคดี" maxLength={80} onBlur={(e) => e.target.value.trim() !== (d.title || '') && upd(d, { title: e.target.value.trim() })} />}
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
      </>)}
        </div>
      </div>
    </Shell>
  )
}
