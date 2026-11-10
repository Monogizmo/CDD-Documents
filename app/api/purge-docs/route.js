import { createClient } from '@supabase/supabase-js'

// Server only. Env: SUPABASE_SERVICE_ROLE_KEY (already used by /api/staff-code).
// Deletes ALL uploaded documents of one candidate: the files in Storage AND the rows in the documents table (and leftover files nobody has a row for).
// The candidate record, checklist and review log stay. Who may call it:
//   admin / recruiter -> any candidate      hiring -> only candidates handed over to Hiring (offer_made)
// Body: { candidateId }   Header: Authorization: Bearer <the signed-in user's access token>
const BUCKET = 'candidate-docs'

async function listAll(admin, prefix) {
  const out = []
  const { data } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 })
  for (const e of data || []) {
    if (e.id) out.push(prefix + '/' + e.name)                       // a file
    else out.push(...(await listAll(admin, prefix + '/' + e.name))) // a folder (category)
  }
  return out
}

export async function POST(req) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 })
  const { candidateId } = await req.json().catch(() => ({}))
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!candidateId || !token) return Response.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: u } = await admin.auth.getUser(token)
  const email = (u?.user?.email || '').toLowerCase()
  if (!email) return Response.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  const { data: st } = await admin.from('staff').select('role, active').eq('email', email).maybeSingle()
  if (!st || !st.active || !['admin', 'recruiter', 'hiring'].includes(st.role)) return Response.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  const { data: cand } = await admin.from('candidates').select('id, offer_made').eq('id', candidateId).maybeSingle()
  if (!cand) return Response.json({ error: 'ไม่พบ Candidate' }, { status: 404 })
  if (st.role === 'hiring' && !cand.offer_made) return Response.json({ error: 'ไม่มีสิทธิ์กับ Candidate คนนี้' }, { status: 403 })

  const { data: rows } = await admin.from('documents').select('id, storage_path').eq('candidate_id', candidateId)
  const paths = new Set((rows || []).map((r) => r.storage_path))
  try { (await listAll(admin, candidateId)).forEach((p) => paths.add(p)) } catch { /* the rows' own paths are still removed */ }
  const list = [...paths]
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET).remove(list.slice(i, i + 100))
    if (error) return Response.json({ error: 'ลบไฟล์ใน Storage ไม่สำเร็จ: ' + error.message }, { status: 500 })
  }
  const { error: de } = await admin.from('documents').delete().eq('candidate_id', candidateId)
  if (de) return Response.json({ error: de.message }, { status: 500 })
  await admin.from('audit_log').insert({ action: 'delete', actor_role: st.role, candidate_id: candidateId, detail: { by: email, purge_all: true, files: list.length, rows: (rows || []).length } })
  return Response.json({ files: list.length, rows: (rows || []).length })
}
