'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { CATS, RCATS, RC, AOU, REHIRE, rlbl, rreq, okR, nm, base, fname, lbl, fdt, redactTxt } from '../../lib/categories'
import { BUCKET, genericJobs, storeJobs } from '../../lib/upload'
import { parseAou, parseRehire } from '../../lib/classify'
import { DS, docStatus, chainOf } from '../../lib/status'
import { buildRows, filterRows } from '../../lib/rows'
import { eligible, addFiles, zipName, saveBlob, JSZip } from '../../lib/zipper'
import OtpLogin from '../../components/OtpLogin'
import CodeLogin from '../../components/CodeLogin'
import Summary from '../../components/Summary'
import Stepper from '../../components/Stepper'
import BulkUpload from '../../components/BulkUpload'
import Avatar from '../../components/Avatar'
import Dashboard from '../../components/Dashboard'
import Fold from '../../components/Fold'
import Versions from '../../components/Versions'
import SearchFilter from '../../components/SearchFilter'
import ReviewCenter from '../../components/ReviewCenter'
import BulkDownload from '../../components/BulkDownload'
import Reports from '../../components/Reports'
import { usePhotoUrls } from '../../lib/photos'
import { stageOf, STAGE_NAME } from '../../lib/stage'

const Shell = ({ children, right }) => (
  <>
    <div className="topbar"><div className="topin">
      <div className="brand"><span className="logo">HR</span><div><b>จัดการเอกสารผู้สมัคร</b><div className="sub">Recruiter workspace</div></div></div>
      {right}
    </div></div>
    <div className="wrap xl">{children}</div>
  </>
)
const Ic = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const NAV = [
  ['dash', 'Dashboard', 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', 'Home'],
  ['cands', 'Candidate List', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', 'คนสมัคร'],
  ['review', 'Document Review', 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', 'ตรวจ'],
  ['bulk', 'Bulk Download', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', 'โหลด'],
  ['reports', 'Reports', 'M18 20V10M12 20V4M6 20v-6', 'รายงาน'],
  ['add', 'เพิ่มแคนดิเดต', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6', 'เพิ่ม'],
]
const TITLE = Object.fromEntries(NAV.map((n) => [n[0], n[1]]))
const titleBox = (d, upd) => <input type="text" defaultValue={d.title} placeholder="ไฟล์นี้เกี่ยวกับอะไร (ใช้เป็นชื่อไฟล์) เช่น สรุปสำนวนคดี" maxLength={80} onBlur={(e) => e.target.value.trim() !== (d.title || '') && upd(d, { title: e.target.value.trim() })} />

export default function Staff() {
  const [ses, setSes] = useState(undefined)
  const [role, setRole] = useState(null)
  const [cands, setC] = useState([])
  const [docs, setD] = useState([])        // active files only
  const [hist, setH] = useState([])        // superseded (old revision) files
  const [evs, setE] = useState([])         // review log
  const [sel, setSel] = useState(null)
  const [f, setF] = useState({ srf: '', pos: '', email: '' })
  const [msg, setMsg] = useState('')
  const [flt, setFlt] = useState({ q: '', pos: '', st: 'all' })
  const [bz, setBz] = useState('')
  const [pg, setPg] = useState('dash')
  const [rv, setRv] = useState(null)       // candidate id open in the Review Center
  const photos = usePhotoUrls(docs)
  const timer = useRef(null)

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
      const e = await supabase.from('document_events').select('*').order('created_at')
      const ck = Object.fromEntries((k.data || []).map((x) => [x.candidate_id, x]))
      setC((a.data || []).map((x) => ({ ...x, aou_status: ck[x.id]?.aou_status || null, rehire_status: ck[x.id]?.rehire_status || null })))
      const all = b.data || []
      setD(all.filter((d) => !d.superseded_at)); setH(all.filter((d) => d.superseded_at)); setE(e.data || [])
    }
  }, [])
  useEffect(() => { if (ses) load() }, [ses, load])
  // real-time: a candidate uploads -> this page refreshes by itself (debounced)
  useEffect(() => {
    if (!ses) return
    const soft = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 400) }
    const ch = supabase.channel('staff-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, soft)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, soft)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_checks' }, soft)
      .subscribe()
    return () => { supabase.removeChannel(ch); clearTimeout(timer.current) }
  }, [ses, load])

  const out = ses ? <button className="btn sm" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button> : null
  if (ses === undefined) return null
  if (!ses) return <Shell><OtpLogin title="สำหรับเจ้าหน้าที่ HR" /><CodeLogin /></Shell>
  if (role === null) return <Shell right={out}>กำลังโหลด...</Shell>
  if (role !== 'admin' && role !== 'recruiter')
    return <Shell right={out}><div className="panel">{role === 'hiring' ? <>บัญชีนี้เป็นทีม Hiring · ไปที่ <a href="/hiring">หน้ารับเอกสารของ Hiring</a></> : 'อีเมลนี้ยังไม่มีสิทธิ์ใช้งานหน้านี้'}</div></Shell>

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('candidates').insert({ srf_no: f.srf.trim(), position: f.pos.trim(), email: f.email.trim().toLowerCase() })
    if (error) setMsg(error.message); else { setMsg('เพิ่มแคนดิเดตแล้ว'); setF({ srf: '', pos: '', email: '' }); load() }
  }
  async function upd(d, p) {
    const { error } = await supabase.from('documents').update(p).eq('id', d.id)
    setMsg(error ? (/ID card/.test(error.message) ? 'บัตรประชาชนต้องผ่านการตรวจไฟล์สุดท้ายของ HR ก่อนอนุมัติ' : error.message) : '')
    load()
  }
  // Review Center actions. status: 'ok' = Approve · 'fix' = Request Revision (note required) · 'wait' = undo
  async function review(d, status, note = '') {
    if (status === 'ok' && d.category === '2.1') {
      if (!confirm('ยืนยันว่าตรวจไฟล์สุดท้ายแล้ว และไม่พบศาสนาและหมู่โลหิตบนบัตร (หรือบัตรไม่มีข้อมูลนี้)?')) return
      return upd(d, { status: 'ok', note: '', redaction_checked_at: new Date().toISOString(), redaction_checked_by: ses.user.email })
    }
    if (status === 'fix' && !note.trim()) { setMsg('กรุณาระบุเหตุผลที่ต้องแก้ไข'); return }
    return upd(d, { status, note: status === 'fix' ? note.trim() : '', ...(d.category === '2.1' ? { redaction_checked_at: null, redaction_checked_by: null } : {}) })
  }
  async function comment(d, text, visible) {
    const { error } = await supabase.from('document_events').insert({ document_id: d.id, candidate_id: d.candidate_id, category: d.category, action: 'comment', comment: text, visible, actor_role: 'recruiter', actor_email: ses.user.email, file_name: d.original_name, rev: d.rev })
    setMsg(error ? error.message : ''); load()
  }
  // first time a file scrolls into view in the Review Center: Received -> Pending
  async function opened(d) {
    const at = new Date().toISOString()
    setD((a) => a.map((x) => (x.id === d.id ? { ...x, opened_at: at } : x)))
    await supabase.from('documents').update({ opened_at: at }).eq('id', d.id)
  }
  async function view(d) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60)
    if (data) window.open(data.signedUrl, '_blank')
  }
  async function delDoc(d) {
    if (!confirm('ลบไฟล์นี้ (รวมประวัติเวอร์ชันเก่าของไฟล์นี้)?')) return
    const ch = chainOf(d, hist)
    await supabase.storage.from(BUCKET).remove(ch.map((x) => x.storage_path))
    await supabase.from('documents').delete().in('id', ch.map((x) => x.id)); load()
  }
  async function delCand(c) {
    if (!confirm('ลบแคนดิเดตและไฟล์ทั้งหมด? ย้อนกลับไม่ได้')) return
    const p = [...docs, ...hist].filter((d) => d.candidate_id === c.id).map((d) => d.storage_path)
    if (p.length) await supabase.storage.from(BUCKET).remove(p)
    await supabase.from('candidates').delete().eq('id', c.id); setSel(null); load()
  }
  // Hiring (/hiring) sees only candidates with offer_made = true, and only Verified files
  async function setOffer(c, v) {
    if (v && !confirm('ส่งแคนดิเดตนี้ให้ Hiring รับเอกสาร?' + (candOk(c) ? '' : '\n\nหมายเหตุ: เอกสารยังไม่ครบทั้งสองฝั่ง Hiring จะเห็นเฉพาะไฟล์ที่ Verified แล้ว'))) return
    const { error } = await supabase.from('candidates').update({ offer_made: v }).eq('id', c.id)
    setMsg(error ? error.message : v ? 'ส่งให้ Hiring แล้ว' : 'ยกเลิกการส่งให้ Hiring แล้ว'); load()
  }
  const candOk = (c) => info.find((i) => i.c.id === c.id)?.both
  async function zip(c) {
    const list = eligible(c, docs, 'verified', true)
    if (!list.length) { setMsg('ยังไม่มีไฟล์ที่ Verified'); return }
    setMsg('กำลังรวมไฟล์...')
    const z = new JSZip(); await addFiles(z, c, list)
    saveBlob(await z.generateAsync({ type: 'blob' }), zipName(c) + '.zip'); setMsg('')
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
    const old = docs.find((d) => d.candidate_id === c.id && d.category === k[0])
    // recruiter-side files need no review step, so they are stored as already approved (they go into the Zip)
    // one file per category: a new file becomes the next revision and the old one stays in the history
    if (k[0] !== 'ROT' && jobs.length > 1) { bad.push('หมวดนี้ใช้ 1 ไฟล์ ระบบใช้ไฟล์แรกให้'); jobs.length = 1 }
    await storeJobs(c.id, k[0], jobs, bad, { status: 'ok', ...(k[0] !== 'ROT' && old ? { replaces: old.id } : {}) })
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

  function openCand(c) {          // from the dashboard: jump to the Review Center of this candidate
    setPg('review'); setRv(c.id)
  }
  function showCand(c) {
    setPg('cands'); setFlt({ q: '', pos: '', st: 'all' }); setSel(c.id)
    setTimeout(() => document.getElementById('cand-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }
  const go = (k) => { setPg(k); setMsg(''); if (k !== 'review') setRv(null) }
  const nameOf = (c) => (c.first_name ? base(c) : c.email)

  const info = buildRows(cands, docs)
  const positions = [...new Set(cands.map((c) => c.position).filter(Boolean))].sort()
  const list = filterRows(info, flt)
  const rvRow = rv && info.find((i) => i.c.id === rv)
  const filesWait = info.reduce((a, i) => a + i.w, 0), filesFix = info.reduce((a, i) => a + i.x, 0)

  const Tags = ({ r }) => (
    <>
      {r.rc > 0 && <span className={'tag ' + DS.received[2]}>Received {r.rc}</span>}{' '}
      {r.pd > 0 && <span className="tag">Pending {r.pd}</span>}{' '}
      {r.x > 0 && <span className="tag bad">Revision Required {r.x}</span>}
    </>
  )
  return (
    <Shell right={out}>
      <div className="app">
        <nav className="side" aria-label="เมนู">
          {NAV.map(([k, t, d, s]) => <button type="button" key={k} className={'nav' + (pg === k ? ' on' : '')} onClick={() => go(k)}><Ic d={d} /><span className="lf">{t}</span><span className="ls">{s}</span></button>)}
          <a className="nav hl" href="/hiring"><Ic d="M4 4h16v16H4zM9 9h6M9 13h6M9 17h3" /><span className="lf">หน้า Hiring</span><span className="ls">Hiring</span></a>
        </nav>
        <div className="main">
          {msg && <div className="err" style={{ marginBottom: 10 }}>{msg}</div>}
          <h1 className="pgt">{TITLE[pg]}</h1>

          {pg === 'dash' && <Dashboard rows={info} photos={photos} onOpen={openCand} onZip={zip} />}

          {pg === 'add' && (
            <form className="panel" onSubmit={add}>
              <b>เพิ่มแคนดิเดต</b>
              <div className="grid3">
                <label className="f">อีเมลแคนดิเดต<input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
                <label className="f">เลข SRF<input type="text" value={f.srf} placeholder="002/2026" onChange={(e) => setF({ ...f, srf: e.target.value })} /></label>
                <label className="f">ชื่อตำแหน่ง<input type="text" value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value })} /></label>
              </div>
              <div style={{ marginTop: 12 }}><button className="btn pri" type="submit">เพิ่ม</button></div>
            </form>
          )}

          {pg === 'reports' && <Reports rows={info} />}
          {pg === 'bulk' && <BulkDownload rows={info} docs={docs} positions={positions} photos={photos} />}

          {pg === 'review' && (rvRow ? (
            <ReviewCenter c={rvRow.c} m={rvRow.m} hist={hist.filter((h) => h.candidate_id === rvRow.c.id)} events={evs.filter((e) => e.candidate_id === rvRow.c.id)}
              photo={photos[rvRow.c.id]} onBack={() => setRv(null)} onReview={review} onComment={comment} onOpened={opened} />
          ) : (
            <>
              <div className="hint" style={{ marginBottom: 10 }}>เลือกแคนดิเดตเพื่อดูเอกสารทั้งหมดในหน้าจอเดียว พร้อม Approve / Request Revision / Comment และประวัติการตรวจสอบ</div>
              <SearchFilter f={flt} setF={setFlt} positions={positions} />
              {!list.length && <div className="panel">ไม่พบแคนดิเดตตามเงื่อนไข</div>}
              {[...list].sort((a, b) => b.rc + b.pd + b.x - (a.rc + a.pd + a.x)).map((r) => (
                <section className="panel" key={r.c.id}>
                  <div className="row" style={{ cursor: 'default' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                      <Avatar url={photos[r.c.id]} name={r.c.first_name ? base(r.c) : ''} size={46} />
                      <div style={{ minWidth: 0 }}><b>{nameOf(r.c)}</b><div className="sub">{r.c.position} · SRF {r.c.srf_no}</div></div>
                    </div>
                    <div className="rr">
                      <Tags r={r} /> <span className="tag ok">Verified {r.m.filter((d) => d.status === 'ok').length}</span>{' '}
                      <button type="button" className="btn pri sm" onClick={() => setRv(r.c.id)}>เปิด Review Center</button>
                    </div>
                  </div>
                </section>
              ))}
            </>
          ))}

          {pg === 'cands' && (
            <>
              <div className="kpis">
                <div className="kpi"><span className="sub">ผู้สมัครทั้งหมด</span><b>{cands.length}</b></div>
                <div className="kpi"><span className="sub">Missing · ยังขาดเอกสารบังคับ (คน)</span><b>{info.filter((i) => i.miss.length).length}</b></div>
                <div className="kpi"><span className="sub">ไฟล์รอตรวจ (Received + Pending)</span><b>{filesWait}</b></div>
                <div className="kpi"><span className="sub">Revision Required (ไฟล์)</span><b>{filesFix}</b></div>
                <div className="kpi"><span className="sub">เอกสารฝั่งแคนดิเดตครบ (คน)</span><b>{info.filter((i) => i.candDone).length}</b></div>
                <div className="kpi"><span className="sub">เอกสารฝั่ง Recruiter ครบ (คน)</span><b>{info.filter((i) => i.recDone).length}</b></div>
                <div className="kpi"><span className="sub">ครบทั้งสองฝั่ง (คน)</span><b>{info.filter((i) => i.both).length}</b></div>
              </div>
              <SearchFilter f={flt} setF={setFlt} positions={positions} />
              <div className="hint" style={{ marginBottom: 10 }}>พบ {list.length} จาก {cands.length} คน</div>
              {!list.length && <div className="panel">ไม่พบแคนดิเดตตามเงื่อนไข</div>}
              {list.map((r) => {
                const { c, m, mr, n, miss, rn, rmiss } = r, open = sel === c.id
                return (
                  <section className="panel" key={c.id} id={'cand-' + c.id}>
                    <div className="row" onClick={() => setSel(open ? null : c.id)}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                        <Avatar url={photos[c.id]} name={c.first_name ? base(c) : ''} size={46} />
                        <div style={{ minWidth: 0 }}><b>{base(c)}</b><div className="sub">{c.position} · SRF {c.srf_no} · {c.email}</div></div>
                      </div>
                      <div className="rr">
                        <span className={'tag ' + (miss.length ? '' : 'ok')}>แคนดิเดตส่งแล้ว {n - miss.length}/{n}</span>{' '}
                        <span className={'tag ' + (rmiss.length ? '' : 'ok')}>Recruiter {rn - rmiss.length}/{rn}</span>{' '}
                        {r.candDone && <span className="tag ok">แคนดิเดตครบ ✓</span>}{' '}{r.recDone && <span className="tag ok">Recruiter ครบ ✓</span>}{' '}{c.offer_made && <span className="tag n">ส่งให้ Hiring แล้ว</span>}{' '}
                        <Tags r={r} />
                      </div>
                    </div>
                    {miss.length > 0 && <div className="err">Missing (บังคับ): {miss.map(lbl).join(' · ')}</div>}
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
                              {!photos[c.id] && <span className="tag g">ยังไม่มีรูปถ่าย</span>}
                              {m.some((d) => d.category === 'PH' && d.status === 'fix') && <span className="tag bad">รูปต้องแก้ไข</span>}
                            </div>
                          </div>
                        </div>
                        <div className="ctl" style={{ marginTop: 12 }}>
                          <button className="btn pri" onClick={() => { setPg('review'); setRv(c.id) }}>เปิด Review Center</button>
                          <button className="btn" onClick={() => zip(c)}>โหลด Zip (Verified)</button>
                          <button className={'btn' + (c.offer_made ? '' : ' pri')} onClick={() => setOffer(c, !c.offer_made)}>{c.offer_made ? 'ยกเลิกการส่งให้ Hiring' : 'ส่งให้ Hiring รับเอกสาร'}</button>
                          <button className="btn" onClick={() => delCand(c)}>ลบแคนดิเดต</button>
                        </div>
                        <div style={{ marginTop: 12 }}><Stepper c={c} docs={docs} rdone={!rmiss.length} /></div>

                        <Fold title="สรุปเอกสารผู้สมัคร" badge={miss.length ? <span className="tag bad" style={{ marginLeft: 8 }}>ขาด {miss.length}</span> : <span className="tag ok" style={{ marginLeft: 8 }}>ครบ</span>}>
                          <Summary c={c} docs={docs} photo={photos[c.id]} />
                        </Fold>

                        <Fold title="Checklist เอกสารฝั่ง Recruiter" badge={<span className={'tag ' + (rmiss.length ? '' : 'ok')} style={{ marginLeft: 8 }}>{rn - rmiss.length}/{rn}</span>}>
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
                                      <div className="fl"><span>{fname(c, d, l)}</span><span className="tag ok">Received</span></div>
                                      <div className="hint">อัปเดต {fdt(d.updated_at || d.created_at)}</div>
                                      <div className="ctl">
                                        <button className="btn sm" onClick={() => view(d)}>เปิดดู</button>
                                        <select value={d.category} onChange={(e) => upd(d, { category: e.target.value })}>
                                          {RCATS.map((x) => <option key={x[0]} value={x[0]}>ย้ายไป {rlbl(x)}</option>)}
                                        </select>
                                        <button className="btn sm" onClick={() => delDoc(d)}>ลบ</button>
                                      </div>
                                      {d.category === 'ROT' && titleBox(d, upd)}
                                      {chainOf(d, hist).length > 1 && (
                                        <Fold small title="ประวัติไฟล์เก่า" badge={<span className="tag n" style={{ marginLeft: 8 }}>{chainOf(d, hist).length} เวอร์ชัน</span>}>
                                          <Versions chain={chainOf(d, hist)} onOpen={(v) => view(v)} />
                                        </Fold>
                                      )}
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
                        </Fold>

                        <Fold title="เอกสารที่แคนดิเดตส่ง" badge={<span className="tag g" style={{ marginLeft: 8 }}>{m.length} ไฟล์</span>}>
                          <ul className="files">
                            {!m.length && <li>ยังไม่มีไฟล์จากแคนดิเดต</li>}
                            {m.map((d) => {
                              const s = docStatus(d)
                              return (
                                <li key={d.id}>
                                  <div className="fl"><span>{fname(c, d, m)} {d.rev > 1 && <span className="tag n">v{d.rev}</span>}</span><span className={'tag ' + DS[s][2]}>{DS[s][0]}</span></div>
                                  <div className="hint">อัปเดต {fdt(d.updated_at)}
                                    {d.category === '2.1' && ` · ${redactTxt(d)}${d.redaction_checked_at ? ' · HR ตรวจแล้ว (' + d.redaction_checked_by + ')' : ' · รอ HR ตรวจไฟล์สุดท้าย'}`}</div>
                                  {d.status === 'fix' && <div className="err">เหตุผล: {d.note}</div>}
                                  <div className="ctl">
                                    <button className="btn sm" onClick={() => view(d)}>เปิดดู</button>
                                    <button className="btn sm" onClick={() => { setPg('review'); setRv(c.id) }}>ตรวจใน Review Center</button>
                                    <select value={d.category} onChange={(e) => upd(d, { category: e.target.value })}>
                                      {CATS.map((k) => <option key={k[0]} value={k[0]}>ย้ายไป {nm(k[0])}{k[1]}</option>)}
                                    </select>
                                    <button className="btn sm" onClick={() => delDoc(d)}>ลบ</button>
                                  </div>
                                  {d.category === 'OT' && titleBox(d, upd)}
                                </li>
                              )
                            })}
                          </ul>
                        </Fold>
                      </>
                    )}
                  </section>
                )
              })}
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}
