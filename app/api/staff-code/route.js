import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Server only. Env: SUPABASE_SERVICE_ROLE_KEY, STAFF_ACCESS_CODE, STAFF_CODE_EMAIL (staff), HIRING_CODE_EMAIL (hiring)
// One team code for every side. mode: 'staff' (default) | 'hiring' | 'candidate' (needs the candidate's email, which must already be invited)
export async function POST(req) {
  const { code, name, mode: m, email: who } = await req.json().catch(() => ({}))
  const mode = ['hiring', 'candidate'].includes(m) ? m : 'staff'
  const want = process.env.STAFF_ACCESS_CODE
  const email = mode === 'candidate' ? String(who || '').trim().toLowerCase() : (mode === 'hiring' ? process.env.HIRING_CODE_EMAIL : process.env.STAFF_CODE_EMAIL || '').trim().toLowerCase()
  if (!want || !process.env.SUPABASE_SERVICE_ROLE_KEY || (mode !== 'candidate' && !email))
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
  if (mode === 'candidate') {
    // only an invited candidate can be opened; nobody new is created
    const { data: cd } = await admin.from('candidates').select('id').eq('email', email).maybeSingle()
    if (!cd) return Response.json({ error: 'ไม่พบอีเมลนี้ในรายชื่อ Candidate' }, { status: 404 })
  }
  await admin.auth.admin.createUser({ email, email_confirm: true }) // ignored if it already exists
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  await admin.from('audit_log').insert({ action: 'code_login', actor_role: 'shared_code', detail: { name: String(name || '').slice(0, 60), email, mode } })
  return Response.json({ token_hash: data.properties.hashed_token })
}
