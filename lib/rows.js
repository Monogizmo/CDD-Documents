// One row per candidate with everything the HR screens need (all derived from documents)
import { reqd, okCat, rreqd, okR, isR, base } from './categories'
import { stageOf, sides } from './stage'
import { docStatus } from './status'

export function buildRows(cands, docs) {
  return cands.map((c) => {
    const all = docs.filter((d) => d.candidate_id === c.id), m = all.filter((d) => !isR(d.category)), mr = all.filter((d) => isR(d.category)), r = reqd(c), rr = rreqd(c)
    const st = m.map(docStatus), sd = sides(c, all)
    return {
      c, m, mr, stage: stageOf(c, all), candDone: sd.candDone, recDone: sd.recDone, both: sd.candDone && sd.recDone, n: r.length, miss: r.filter((k) => !okCat(m, c, k)),
      rn: rr.length, rmiss: rr.filter((k) => !okR(mr, c, k)),
      w: m.filter((d) => d.status === 'wait').length, x: m.filter((d) => d.status === 'fix').length,
      rc: st.filter((s) => s === 'received').length, pd: st.filter((s) => s === 'pending').length,
      allv: r.length > 0 && r.every((k) => { const l = m.filter((d) => d.category === k[0]); return l.length > 0 && l.every((d) => d.status === 'ok') }),
    }
  })
}

export const STATUS_FILTERS = [
  ['all', 'ทุกสถานะ'], ['missing', 'Missing · ยังขาดเอกสารบังคับ'], ['received', 'Received · ได้รับไฟล์แล้ว'], ['pending', 'Pending · รอตรวจ'],
  ['revision', 'Revision Required · ต้องแก้ไข'], ['verified', 'Verified · ตรวจผ่านครบ'], ['cdone', 'เอกสารฝั่งแคนดิเดตครบ'], ['rdone', 'เอกสารฝั่ง Recruiter ครบ'], ['both', 'ครบทั้งสองฝั่ง'], ['rmiss', 'ฝั่ง Recruiter ยังไม่ครบ'],
]
export function filterRows(rows, { q = '', pos = '', st = 'all', rec = '' }) {
  const t = q.trim().toLowerCase()
  return rows.filter((r) => {
    const c = r.c
    if (pos && c.position !== pos) return false
    if (rec && c.recruiter_name !== rec) return false
    if (t && !`${c.first_name || ''} ${c.last_name || ''} ${base(c)} ${c.email} ${c.srf_no} ${c.position} ${c.recruiter_name || ''}`.toLowerCase().includes(t)) return false
    return st === 'all' || (st === 'missing' && r.miss.length) || (st === 'received' && r.rc) || (st === 'pending' && r.pd) || (st === 'revision' && r.x) || (st === 'verified' && r.allv) || (st === 'cdone' && r.candDone) || (st === 'rdone' && r.recDone) || (st === 'both' && r.both) || (st === 'rmiss' && r.rmiss.length)
  })
}
