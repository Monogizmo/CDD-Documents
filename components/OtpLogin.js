'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function OtpLogin({ title }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')
  async function send() {
    setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
    if (error) setErr(error.message); else setStep(1)
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
        <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      {step === 1 && (
        <label className="f" style={{ marginTop: 10 }}>รหัส OTP จากอีเมล
          <input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
      )}
      <div style={{ marginTop: 12 }}>
        <button className="btn pri" onClick={step === 0 ? send : verify}>{step === 0 ? 'ส่งรหัส OTP ไปที่อีเมล' : 'เข้าสู่ระบบ'}</button>
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
