'use client'
import { useEffect, useState, useCallback } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../lib/supabase'
import { CATS, nm, base, reqd, okCat, fname, lbl } from '../../lib/categories'
import Summary from '../../components/Summary'
import OtpLogin from '../../components/OtpLogin'
import CodeLogin from '../../components/CodeLogin'

const ST = { wait: 'รอตรวจ', ok: 'ผ่านแล้ว', fix: 'ต้องแก้ไข' }
const BUCKET = 'candidate-docs'
const Shell = ({ children }) => (
  <div className="wrap"><header><h1>จัดการเอกสารผู้สมัคร</h1></header>{children}</div>
)

export default function Staff() {
  const [ses, setSes] = useState(undefined)
  const [role, setRole] = useState(null)
  const [cands, setC] = useState([])
  const [docs, setD] = useState([])
  const [sel, setSel] = useState(null)
  const [f, setF] = useState({ srf: '', pos: '', email: '' })
  const [msg, setMsg] = useState('')

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

  if (ses === undefined) return null
  if (!ses) return <Shell><OtpLogin title="สำหรับเจ้าหน้าที่ HR" /><CodeLogin /></Shell>
  if (role === null) return <Shell>กำลังโหลด...</Shell>
  if (role !== 'admin' && role !== 'recruiter')
    return <Shell><p>อีเมลนี้ยังไม่มีสิทธิ์ใช้งานหน้านี้</p><button className="btn" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button></Shell>

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('candidates').insert({ srf_no: f.srf.trim(), position: f.pos.trim(), email: f.email.trim().toLowerCase() })
    if (error) setMsg(error.message); else { setMsg(''); setF({ srf: '', pos: '', email: '' }); load() }
  }
  async function upd(d, p) { await supabase.from('documents').update(p).eq('id', d.id); load() }
  async function view(d) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60)
    if (data) window.open(data.signedUrl, '_blank')
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
  async function zip(c) {
    const ok = docs.filter((d) => d.candidate_id === c.id && d.status === 'ok')
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

  return (
    <Shell>
      <form className="panel" onSubmit={add}>
        <b>เพิ่มแคนดิเดต</b>
        <div className="grid3">
          <label className="f">อีเมลแคนดิเดต<input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="f">เลข SRF<input type="text" value={f.srf} placeholder="002/2026" onChange={(e) => setF({ ...f, srf: e.target.value })} /></label>
          <label className="f">ชื่อตำแหน่ง<input type="text" value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value })} /></label>
        </div>
        <div style={{ marginTop: 12 }}><button className="btn pri" type="submit">เพิ่ม</button></div>
      </form>
      {msg && <div className="err">{msg}</div>}
      {!cands.length && <div className="panel">ยังไม่มีแคนดิเดต เพิ่มอีเมล เลข SRF และตำแหน่งด้านบน</div>}
      {cands.map((c) => {
        const my = docs.filter((d) => d.candidate_id === c.id)
        const r = reqd(c), n = r.filter((k) => okCat(my, c, k)).length
        const miss = r.filter((k) => !okCat(my, c, k))
        const w = my.filter((d) => d.status === 'wait').length, x = my.filter((d) => d.status === 'fix').length
        const open = sel === c.id
        return (
          <section className="panel" key={c.id}>
            <div className="row" onClick={() => setSel(open ? null : c.id)}>
              <div><b>{base(c)}</b><div className="sub">{c.position} · SRF {c.srf_no} · {c.email}</div></div>
              <span><span className={'tag' + (n === r.length ? ' ok' : '')}>ส่งแล้ว {n}/{r.length}</span>
                {w > 0 && <span className="tag">รอตรวจ {w}</span>}{x > 0 && <span className="tag bad">แก้ไข {x}</span>}</span>
            </div>
            {miss.length > 0 && <div className="err">ยังขาด (บังคับ): {miss.map(lbl).join(' · ')}</div>}
            {open && (
              <>
                <Summary c={c} docs={docs} />
                <ul className="files">
                  {!my.length && <li>ยังไม่มีไฟล์</li>}
                  {my.map((d) => (
                    <li key={d.id}>
                      {fname(c, d, my)} <span className={'tag ' + (d.status === 'ok' ? 'ok' : d.status === 'fix' ? 'bad' : '')}>{ST[d.status]}</span>
                      <div className="ctl">
                        <button className="btn" onClick={() => view(d)}>เปิดดู</button>
                        <select value={d.status} onChange={(e) => upd(d, { status: e.target.value, note: e.target.value === 'fix' ? d.note : '' })}>
                          {Object.keys(ST).map((s) => <option key={s} value={s}>{ST[s]}</option>)}
                        </select>
                        <select value={d.category} onChange={(e) => upd(d, { category: e.target.value })}>
                          {CATS.map((k) => <option key={k[0]} value={k[0]}>ย้ายไป {nm(k[0])}{k[1]}</option>)}
                        </select>
                        <button className="btn" onClick={() => delDoc(d)}>ลบ</button>
                      </div>
                      {d.status === 'fix' && (
                        <input type="text" defaultValue={d.note} placeholder="เหตุผลที่ต้องแก้ไข (แคนดิเดตจะเห็น)" onBlur={(e) => upd(d, { note: e.target.value })} />
                      )}
                    </li>
                  ))}
                </ul>
                <div className="ctl" style={{ marginTop: 12 }}>
                  <button className="btn pri" onClick={() => zip(c)}>โหลดทั้งชุด (Zip) เฉพาะที่ผ่านแล้ว</button>
                  <button className="btn" onClick={() => delCand(c)}>ลบแคนดิเดต</button>
                </div>
              </>
            )}
          </section>
        )
      })}
      <p className="mute" style={{ textAlign: 'center' }}><a href="#" onClick={(e) => { e.preventDefault(); supabase.auth.signOut() }}>ออกจากระบบ</a></p>
    </Shell>
  )
}
