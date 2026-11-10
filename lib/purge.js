import { supabase } from './supabase'

// Delete ALL uploaded documents of a candidate (Storage files + rows). Server checks the role. -> { files, rows } or throws Error(message)
export async function purgeDocs(candidateId) {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/purge-docs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') }, body: JSON.stringify({ candidateId }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'ลบไม่สำเร็จ')
  return j
}
