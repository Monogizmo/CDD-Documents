'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { base, fname, fdt, isR } from '../../lib/categories'
import { BUCKET } from '../../lib/upload'
import { eligible, addFiles, zipName, zipCandidate, saveBlob, JSZip } from '../../lib/zipper'
import { usePhotoUrls } from '../../lib/photos'
import OtpLogin from '../../components/OtpLogin'
import Avatar from '../../components/Avatar'

// /hiring : one place where Hiring picks up every document.
// The database only lets the role 'hiring' read candidates marked "ส่งให้ Hiring" (offer_made) and only their Verified files (migration 009).
const Shell = ({ children, right }) => (
  <>
    <div className="topbar"><div className="topin">
      <div className="brand"><span className="logo">HI</span><div><b>รับเอกสารผู้สมัคร</b><div className="sub">Hiring</div></div></div>
      {right}
    </div></div>
    <div className="wrap wide">{children}</div>
  </>
)

export default function Hiring() {
  const [ses, setSes] = useState(undefined)
  const [role, setRole] = useState(null)
  const [cands, setC] = useState([])
  const [docs, setD] = useState([])
  const [q, setQ] = useState('')
  const [pos, setPos] = useState('')
  const [sel, setSel] = useState({})
  const [open, setOpen] = useState(null)
  const [mode, setMode] = useState('one')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const photos = usePhotoUrls(docs)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSes(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSes(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const load = useCallback(async () => {
    setLoading(true)
    const r = await supabase.rpc('my_role')
    setRole(r.data || 'none')
    if (['hiring', 'admin', 'recruiter'].includes(r.data)) {
      const a = await supabase.from('candidates').select('*').eq('offer_made', true).order('created_at', { ascending: false })
      const b = await supabase.from('documents').select('*').order('created_at')
      const k = await supabase.from('candidate_checks').select('*')
      const ck = Object.fromEntries((k.data || []).map((x) => [x.candidate_id, x]))
      setC((a.data || []).map((x) => ({ ...x, aou_status: ck[x.id]?.aou_status || null, rehire_status: ck[x.id]?.rehire_status || null })))
      setD((b.data || []).filter((d) => !d.superseded_at))
    }
    setLoading(false)
  }, [])
  useEffect(() => { if (ses) load() }, [ses, load])

  const out = ses ? <button className="btn sm" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button> : null
  if (ses === undefined) return null
  if (!ses) return <Shell><OtpLogin title="สำหรับทีม Hiring" /></Shell>
  if (role === null) return <Shell right={out}>กำลังโหลด...</Shell>
  if (!['hiring', 'admin', 'recruiter'].includes(role)) return <Shell right={out}><div className="panel">อีเมลนี้ยังไม่มีสิทธิ์ใช้งานหน้านี้ กรุณาติดต่อ Recruiter</div></Shell>

  const files = (c) => eligible(c, docs, 'verified', true)
  const positions = [...new Set(cands.map((c) => c.position).filter(Boolean))].sort()
  const t = q.trim().toLowerCase()
  const list = cands.filter((c) => (!pos || c.position === pos) && (!t || `${base(c)} ${c.email} ${c.srf_no} ${c.position}`.toLowerCase().includes(t)))
  const chosen = list.filter((c) => sel[c.id]), all = list.length > 0 && list.every((c) => sel[c.id])
  const total = list.reduce((a, c) => a + files(c).length, 0)

  async function view(d) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60)
    if (data) window.open(data.signedUrl, '_blank')
  }
  async function run(targets) {
    const todo = targets.map((c) => [c, files(c)]).filter(([, l]) => l.length)
    if (!todo.length) { setMsg('ไม่มีไฟล์ที่พร้อมรับในคนที่เลือก'); return }
    setBusy(true); setMsg('')
    try {
      if (mode === 'one') {
        const z = new JSZip()
        for (let i = 0; i < todo.length; i++) { setMsg(`กำลังรวมไฟล์ ${i + 1}/${todo.length}: ${base(todo[i][0])}`); await addFiles(z, todo[i][0], todo[i][1], zipName(todo[i][0])) }
        saveBlob(await z.generateAsync({ type: 'blob' }), `Documents ${new Date().toISOString().slice(0, 10)}.zip`)
      } else {
        for (let i = 0; i < todo.length; i++) { setMsg(`กำลังรวมไฟล์ ${i + 1}/${todo.length}: ${base(todo[i][0])}`); saveBlob(await zipCandidate(todo[i][0], todo[i][1]), zipName(todo[i][0]) + '.zip') }
      }
      setMsg('')
    } catch { setMsg('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง') }
    setBusy(false)
  }

  return (
    <Shell right={out}>
      <h1 className="pgt">เอกสารที่พร้อมรับ</h1>
      <div className="hint" style={{ marginBottom: 10 }}>แสดงเฉพาะแคนดิเดตที่ Recruiter ส่งให้ Hiring และเฉพาะไฟล์ที่ตรวจผ่านแล้ว (Verified) รวมเอกสารฝั่ง Recruiter ด้วย</div>
      <div className="sf">
        <input type="text" value={q} placeholder="ค้นหา ชื่อ · อีเมล · SRF · ตำแหน่ง" aria-label="ค้นหา" onChange={(e) => setQ(e.target.value)} />
        <select value={pos} aria-label="ตำแหน่ง" onChange={(e) => setPos(e.target.value)}>
          <option value="">ทุกตำแหน่ง</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button type="button" className="btn sm" disabled={loading} onClick={load}>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</button>
      </div>
      <div className="panel">
        <div className="ctl" style={{ marginTop: 0 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="รูปแบบ">
            <option value="one">รวม Zip เดียว (แยกโฟลเดอร์ต่อคน)</option><option value="each">แยก Zip ต่อคน</option>
          </select>
          <button type="button" className="btn pri" disabled={busy || !chosen.length} onClick={() => run(chosen)}>{busy ? 'กำลังทำงาน...' : `ดาวน์โหลดที่เลือก (${chosen.length} คน)`}</button>
          <button type="button" className="btn" disabled={busy || !total} onClick={() => run(list)}>ดาวน์โหลดทั้งหมด ({list.length} คน · {total} ไฟล์)</button>
        </div>
        {msg && <div className="hint" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      {!list.length && <div className="panel">{cands.length ? 'ไม่พบแคนดิเดตตามเงื่อนไข' : 'ยังไม่มีแคนดิเดตที่ส่งให้ Hiring'}</div>}
      {list.length > 0 && (
        <label className="chk2" style={{ margin: '0 0 8px 4px' }}><input type="checkbox" checked={all} onChange={(e) => setSel(Object.fromEntries(list.map((c) => [c.id, e.target.checked])))} /> เลือกทั้งหมด</label>
      )}
      {list.map((c) => {
        const l = files(c), isOpen = open === c.id, mine = l.filter((d) => !isR(d.category)), rec = l.filter((d) => isR(d.category))
        return (
          <section className="panel" key={c.id}>
            <div className="row" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                <input type="checkbox" checked={!!sel[c.id]} aria-label={'เลือก ' + base(c)} onChange={(e) => setSel({ ...sel, [c.id]: e.target.checked })} />
                <Avatar url={photos[c.id]} name={c.first_name ? base(c) : ''} size={46} />
                <div style={{ minWidth: 0 }}><b>{c.first_name ? base(c) : c.email}</b><div className="sub">{c.position} · SRF {c.srf_no}</div></div>
              </div>
              <div className="rr">
                <span className="tag ok">{l.length} ไฟล์พร้อมรับ</span>{' '}
                <button type="button" className="btn sm" onClick={() => setOpen(isOpen ? null : c.id)}>{isOpen ? 'ซ่อนไฟล์' : 'ดูไฟล์'}</button>{' '}
                <button type="button" className="btn pri sm" disabled={busy || !l.length} onClick={() => run([c])}>โหลด Zip</button>
              </div>
            </div>
            {isOpen && (
              <ul className="files">
                {!l.length && <li>ยังไม่มีไฟล์ที่ตรวจผ่าน</li>}
                {[...mine, ...rec].map((d) => (
                  <li key={d.id}>
                    <div className="fl"><span>{fname(c, d, l)}</span><button type="button" className="btn sm" onClick={() => view(d)}>เปิดดู</button></div>
                    <div className="hint">{isR(d.category) ? 'เอกสารฝั่ง Recruiter' : 'เอกสารแคนดิเดต'} · อัปเดต {fdt(d.updated_at || d.created_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </Shell>
  )
}
