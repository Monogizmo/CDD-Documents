// Pipeline stage of a candidate (derived from the documents, nothing extra to store)
import { reqd, req, okCat, rreqd, okR, isR } from './categories'

export const STAGES = [
  ['invited', 'เชิญแล้ว'],
  ['collecting', 'กำลังส่งเอกสาร'],
  ['review', 'รอ HR ตรวจ'],
  ['cand_done', 'ฝั่งแคนดิเดตครบ'],
  ['complete', 'ครบทั้งสองฝั่ง'],
]
export const STAGE_NAME = Object.fromEntries(STAGES)

// The two sides are tracked separately:
//   candDone = every required candidate document is sent AND Verified by HR
//   recDone  = every required recruiter-side document is in
export function sides(c, all) {
  const m = all.filter((d) => !isR(d.category)), mr = all.filter((d) => isR(d.category))
  const r = reqd(c), sent = r.every((k) => okCat(m, c, k))
  const candDone = sent && r.every((k) => { const l = m.filter((d) => d.category === k[0]); return l.length > 0 && l.every((d) => d.status === 'ok') })
  const recDone = rreqd(c).every((k) => okR(mr, c, k))
  return { m, sent, candDone, recDone }
}
export function stageOf(c, all) {
  const { m, sent, candDone, recDone } = sides(c, all)
  if (candDone && recDone) return 'complete'
  if (candDone) return 'cand_done'
  if (sent) return 'review'
  return m.length ? 'collecting' : 'invited'
}

const SHORT = { '2.1': 'บัตร ปชช.', '2.2': 'เปลี่ยนชื่อ', '2.3': 'ทะเบียนบ้าน', '2.4': 'ใบเกรด', '2.5': 'สด.', '2.6': 'ตรวจสุขภาพ', '2.7': 'ใบเสร็จ', '2.8': 'สมุดบัญชี', PH: 'รูปถ่าย', PS: 'สลิป', OT: 'อื่นๆ' }
// one small chip per document category: ok / wait / bad / empty
export function chips(c, m) {
  return req(c).filter((k) => !k[5] || m.some((d) => d.category === k[0])).map((k) => {
    const l = m.filter((d) => d.category === k[0])
    const st = !l.length ? '' : l.some((d) => d.status === 'fix') ? 'bad' : l.every((d) => d.status === 'ok') ? 'ok' : 'wait'
    return { code: k[0], t: SHORT[k[0]] || k[1], st }
  })
}
