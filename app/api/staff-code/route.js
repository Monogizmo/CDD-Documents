import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Server only. Env: SUPABASE_SERVICE_ROLE_KEY, STAFF_ACCESS_CODE, STAFF_CODE_EMAIL
export async function POST(req) {
  const { code, name } = await req.json().catch(() => ({}))
  const want = process.env.STAFF_ACCESS_CODE
  const email = (process.env.STAFF_CODE_EMAIL || '').trim().toLowerCase()
  if (!want || !email || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json({ error: 'ยังไม่ได้ตั้งค่ารหัสเข้าใช้งาน' }, { status: 503 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  // lock: 5 wrong codes in 15 minutes (counted across everyone) blocks the code login; email OTP still works
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count } = await admin.from('access_attempts').select('*', { count: 'exact', head: true }).eq('ok', false).gte('at', since)
  if ((count || 0) >= 5) return Response.json({ error: 'กรอกผิดหลายครั้ง กรุณารอ 15 นาที หรือใช้ OTP ทางอีเมล' }, { status: 429 })
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest()
  const ok = crypto.timingSafeEqual(h(code || ''), h(want))
  await admin.from('access_attempts').insert({ ok })
  if (!ok) return Response.json({ error: 'รหัสไม่ถูกต้อง' }, { status: 401 })
  await admin.auth.admin.createUser({ email, email_confirm: true }) // ignored if it already exists
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  await admin.from('audit_log').insert({ action: 'code_login', actor_role: 'shared_code', detail: { name: String(name || '').slice(0, 60), email } })
  return Response.json({ token_hash: data.properties.hashed_token })
}
