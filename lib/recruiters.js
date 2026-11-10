'use client'
// Recruiter name list. Stored in the table public.recruiters (migration 012) so every HR user sees the same list.
// If the migration has not been run yet, the default list below is used and added / removed names are kept in this browser only.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const DEFAULT_RECRUITERS = [
  'Pisalvit Paphavatana', 'Jiranan Sittidechkullasin', 'Supa Chummano', 'Praethong Tantikijrungrueang',
  'Nataphan Wongprommoon', 'Sunanta Kitbunjerdjarud', 'Anupong Kijjamnongpun', 'Nitchamon Loturit',
  'Supansa Chaicharoen', 'Pawinee Kajornkittibaramee', 'Montita Chaikaew', 'Wannisa Suksai',
  'Piyachat Srisatit', 'Sonklin Kodthong', 'Tipthanya Chatchimplee', 'Amphaporn Dechporn',
]
const LS = 'cdd.recruiters.v1'
const sortNames = (a) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }))
const readLocal = () => { try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (Array.isArray(j)) return j } catch { /* ignore */ } return DEFAULT_RECRUITERS }
const writeLocal = (a) => { try { localStorage.setItem(LS, JSON.stringify(a)) } catch { /* ignore */ } }

// -> { names, shared (true = saved in the database), add(name), remove(name) }  add / remove resolve to an error message or ''
export function useRecruiters(enabled = true) {
  const [names, setNames] = useState(sortNames(DEFAULT_RECRUITERS))
  const [shared, setShared] = useState(true)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('recruiters').select('name')
    if (error) { setShared(false); setNames(sortNames(readLocal())); return }
    setShared(true); setNames(sortNames((data || []).map((x) => x.name)))
  }, [])
  useEffect(() => { if (enabled) load() }, [enabled, load])
  async function add(raw) {
    const name = (raw || '').replace(/\s+/g, ' ').trim()
    if (!name) return 'กรุณาพิมพ์ชื่อ'
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return 'มีชื่อนี้อยู่ในรายการแล้ว'
    if (!shared) { const n = sortNames([...names, name]); writeLocal(n); setNames(n); return '' }
    const { error } = await supabase.from('recruiters').insert({ name })
    if (error) return error.message
    await load(); return ''
  }
  async function remove(name) {
    if (!shared) { const n = names.filter((x) => x !== name); writeLocal(n); setNames(n); return '' }
    const { error } = await supabase.from('recruiters').delete().eq('name', name)
    if (error) return error.message
    await load(); return ''
  }
  return { names, shared, add, remove }
}
