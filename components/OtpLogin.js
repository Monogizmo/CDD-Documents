'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function OtpLogin({ title }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  async function send() {
    setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
    if (error) setErr(error.status === 429 || /second|rate/i.test(error.message) ? 'ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' : error.message)
    else { setStep(1); setLeft(60) }
  }
  async function verify() {
    setErr('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    if (error) setErr('รหัสไม่ถูกต้องหรือหมดอายุ')
  }
  return (
    <div className="panel">
      <b>{title}</b>
      <label className="f">อีเมล
        <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={step === 1} />
      </label>
      {step === 1 && (
        <>
          <label className="f" style={{ marginTop: 10 }}>รหัส OTP จากอีเมล
            <input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} />
          </label>
          <div className="hint">ยังไม่ได้รับรหัส? ลองดูในกล่องสแปมหรืออีเมลขยะด้วย</div>
        </>
      )}
      <div className="ctl" style={{ marginTop: 12 }}>
        <button className="btn pri" onClick={step === 0 ? send : verify}>{step === 0 ? 'ส่งรหัส OTP ไปที่อีเมล' : 'เข้าสู่ระบบ'}</button>
        {step === 1 && <button className="btn" disabled={left > 0} onClick={send}>{left > 0 ? `ขอรหัสใหม่ได้ใน ${left} วินาที` : 'ขอรหัสใหม่'}</button>}
        {step === 1 && <button className="btn" onClick={() => { setStep(0); setCode(''); setErr(''); setLeft(0) }}>เปลี่ยนอีเมล</button>}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
