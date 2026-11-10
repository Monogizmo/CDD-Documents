'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// One login screen for the three entrances. Desktop: brand panel (Krungsri yellow) on the left, sign-in on the right, always inside one screen.
// Phone: a compact yellow header (logo + name), the form below. No clipped artwork on a phone.
// role: 'candidate' (/) | 'staff' (/staff) | 'hiring' (/hiring)
const ROLES = [['candidate', 'Candidate', '/'], ['staff', 'HR Team', '/staff'], ['hiring', 'Hiring', '/hiring']]
const COPY = {
  candidate: { h: 'Welcome back', s: 'ใส่อีเมลที่ได้รับเชิญ เราจะส่งรหัส OTP ให้ แล้วส่งเอกสารได้ทันที ทยอยส่งเท่าที่มีได้' },
  staff: { h: 'Welcome back', s: 'เข้าสู่พื้นที่ทำงานของทีม HR เพื่อตรวจและจัดการเอกสารผู้สมัคร' },
  hiring: { h: 'Welcome back', s: 'เข้ารับเอกสารของผู้สมัครที่ HR ส่งต่อให้ทีม Hiring' },
}
const I = {
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7', key: 'M15 7a4 4 0 1 1-3.5 6L4 20.5V18H2v-2h2v-2h2l3.5-3.5A4 4 0 0 1 15 7z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
}
const Ic = ({ d }) => <svg className="lx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const Tick = () => <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>

function Docs() {
  return (
    <div className="lx-dw" aria-hidden="true">
      <div className="lx-docs">
        <div className="lx-doc d3"><div className="dh"><i /><b>Transcript</b></div><span className="ln" /><span className="ln s" /></div>
        <div className="lx-doc d2"><div className="dh"><i /><b>House Registration</b><em className="st wait">Under Review</em></div><span className="ln" /><span className="ln s" /><span className="ln" /></div>
        <div className="lx-doc d1"><div className="dh"><i /><b>ID Card</b><em className="st ok"><Tick /> Verified</em></div><span className="ln" /><span className="ln s" /></div>
        <div className="lx-badge"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={I.shield} /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg> Secure</div>
      </div>
    </div>
  )
}

export default function LoginScreen({ role = 'candidate' }) {
  const [method, setMethod] = useState('otp')            // otp | code
  const [email, setEmail] = useState(''), [otp, setOtp] = useState(''), [step, setStep] = useState(0), [left, setLeft] = useState(0)
  const [name, setName] = useState(''), [code, setCode] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (left > 0) { const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t) } }, [left])
  const mail = email.trim().toLowerCase()

  async function send() {
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) setErr(error.status === 429 || /second|rate/i.test(error.message) ? 'ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' : error.message)
    else { setStep(1); setLeft(60) }
  }
  async function verify() {
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: mail, token: otp.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr('รหัสไม่ถูกต้องหรือหมดอายุ')
  }
  async function viaCode() {
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/staff-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, mode: role === 'candidate' ? 'candidate' : role, email: mail }) })
      const j = await r.json()
      if (!r.ok) { setErr(j.error || 'เข้าไม่ได้'); return }
      const { error } = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' })
      if (error) setErr(error.message)
    } catch { setErr('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง') } finally { setBusy(false) }
  }
  const submit = (e) => { e.preventDefault(); if (busy) return; if (method === 'code') viaCode(); else if (step === 0) send(); else verify() }
  const c = COPY[role]
  return (
    <div className="lx">
      <aside className="lx-brand">
        <svg className="lx-shapes" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="560" cy="60" r="250" fill="#fff" fillOpacity=".16" />
          <circle cx="30" cy="760" r="270" fill="none" stroke="#2b2723" strokeOpacity=".08" strokeWidth="1.5" />
          <circle cx="30" cy="760" r="190" fill="none" stroke="#2b2723" strokeOpacity=".07" strokeWidth="1.5" />
        </svg>
        <div className="lx-bt">
          <span className="lx-logo">CD</span>
          <div><b>Candidate Document Portal</b><span className="lx-tag">Secure onboarding documents</span></div>
        </div>
        <div className="lx-hero">
          <h2>Your documents,<br />in one place.</h2>
          <p>ส่ง ตรวจ และติดตามเอกสารเริ่มงานในที่เดียว เห็นสถานะทุกไฟล์อย่างโปร่งใส ไม่ต้องไล่ถามกันทางอีเมล</p>
        </div>
        <Docs />
        <ul className="lx-trust"><li><Ic d={I.shield} /> Secure document handling</li><li><Ic d={I.lock} /> เข้าถึงได้เฉพาะผู้มีสิทธิ์ · มีบันทึกการใช้งาน</li></ul>
      </aside>

      <main className="lx-main">
        <div className="lx-card">
          <h1>{c.h}</h1>
          <p className="lx-sub">{c.s}</p>
          <nav className="lx-roles" aria-label="ประเภทผู้ใช้งาน">
            {ROLES.map(([k, t, href]) => <a key={k} href={href} className={k === role ? 'on' : ''} aria-current={k === role ? 'page' : undefined}>{t}</a>)}
          </nav>
          <div className="lx-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={method === 'otp'} className={method === 'otp' ? 'on' : ''} onClick={() => { setMethod('otp'); setErr('') }}>อีเมล + OTP</button>
            <button type="button" role="tab" aria-selected={method === 'code'} className={method === 'code' ? 'on' : ''} onClick={() => { setMethod('code'); setErr('') }}>รหัสทีม</button>
          </div>
          <form onSubmit={submit} noValidate>
            {(method === 'otp' || role === 'candidate') && (
              <label className="lx-f"><span>{method === 'code' ? 'อีเมลของ Candidate ที่ต้องการเข้า' : 'อีเมล'}</span>
                <div className="lx-in"><Ic d={I.mail} /><input type="email" inputMode="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={method === 'otp' && step === 1} /></div></label>
            )}
            {method === 'otp' && step === 1 && (
              <label className="lx-f"><span>รหัส OTP จากอีเมล</span>
                <div className="lx-in"><Ic d={I.key} /><input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus value={otp} onChange={(e) => setOtp(e.target.value)} /></div>
                <small>ยังไม่ได้รับรหัส? ลองดูในกล่องสแปมหรืออีเมลขยะด้วย</small></label>
            )}
            {method === 'code' && (
              <>
                <label className="lx-f"><span>ชื่อผู้ใช้ <em>(บันทึกไว้ใน log)</em></span>
                  <div className="lx-in"><Ic d={I.user} /><input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div></label>
                <label className="lx-f"><span>รหัสทีม</span>
                  <div className="lx-in"><Ic d={I.lock} /><input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} /></div></label>
              </>
            )}
            <button type="submit" className="lx-go" disabled={busy}>
              {busy ? 'กำลังดำเนินการ...' : method === 'code' ? 'Sign in' : step === 0 ? 'ส่งรหัส OTP ไปที่อีเมล' : 'Sign in'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            {method === 'otp' && step === 1 && (
              <div className="lx-aux">
                <button type="button" disabled={left > 0 || busy} onClick={send}>{left > 0 ? `ขอรหัสใหม่ได้ใน ${left} วินาที` : 'ขอรหัสใหม่'}</button>
                <button type="button" onClick={() => { setStep(0); setOtp(''); setErr(''); setLeft(0) }}>เปลี่ยนอีเมล</button>
              </div>
            )}
            {err && <div className="lx-err" role="alert">{err}</div>}
          </form>
          <p className="lx-priv"><Ic d={I.shield} /> ข้อมูลของคุณถูกใช้เพื่อการสมัครงานเท่านั้น และเข้าถึงได้เฉพาะผู้ที่ได้รับสิทธิ์</p>
        </div>
      </main>
      {/* phone header: compact, yellow, no artwork */}
      <header className="lx-mhead" aria-hidden="true">
        <span className="lx-logo">CD</span><div><b>Candidate Document Portal</b><span>Your documents, in one place.</span></div>
      </header>
    </div>
  )
}
