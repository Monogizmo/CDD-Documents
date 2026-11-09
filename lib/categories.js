// [code, English name, Thai name, hint, allowed ext, optional?]
export const CATS = [
  ['2.1', 'ID Card', 'บัตรประชาชน', 'แนะนำให้ปิดศาสนาและกรุ๊ปเลือด (ไม่บังคับ เพราะบางบัตรไม่มีข้อมูลนี้ หรือปิดมาแล้ว)', ['pdf', 'jpg']],
  ['2.2', 'Name & Surname Change', 'ใบเปลี่ยนชื่อหรือนามสกุล', 'เฉพาะผู้ที่เคยเปลี่ยนชื่อหรือนามสกุล', ['pdf']],
  ['2.3', 'House Registration', 'ทะเบียนบ้าน', '', ['pdf']],
  ['2.4', 'Transcript', 'ใบเกรด', 'ต้องมีวันจบการศึกษาระบุ', ['pdf']],
  ['2.5', 'Military Certificate', 'ใบ สด.8 หรือ สด.43', 'เฉพาะผู้ชาย', ['pdf']],
  ['2.6', 'Health Check Report', 'ผลตรวจสุขภาพ', '', ['pdf']],
  ['2.7', 'Receipt', 'ใบเสร็จผลตรวจสุขภาพ', '', ['pdf', 'jpg']],
  ['2.8', 'Krungsri Passbook', 'หน้าสมุดบัญชีกรุงศรี', 'ใช้หน้าสมุดบัญชีแบบออนไลน์ (จากแอปธนาคาร) ได้ · ต้องเป็นบัญชีที่ยังใช้งานได้', ['pdf', 'jpg']],
  ['PH', 'Photo', 'รูปถ่ายพนักงาน', 'รูปถ่ายหน้าตรงหรือเอียงข้างเล็กน้อย', ['jpg']],
  ['PS', 'Pay Slip', 'สลิปเงินเดือน / ทวิ 50 / ใบรับรองเงินเดือน', '', ['pdf'], true],
  ['OT', 'Other Documents', 'เอกสารอื่นๆ', 'เอกสารอื่นที่ต้องการแนบเพิ่ม ไม่ใช่เอกสารตามรายการด้านบน (ส่งได้หลายไฟล์)', ['pdf', 'jpg'], true],
]
export const nm = (k) => (/^\d\.\d$/.test(k) ? k.replace('.', '-') + ' ' : '')
export const lbl = (k) => nm(k[0]) + k[1] + ' (' + k[2] + ')'
const clean = (s) => {
  s = (s || '').replace(/[^A-Za-z\- ]/g, '').trim()
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
export const base = (c) => (clean(c.first_name) || 'Name') + ' ' + (clean(c.last_name) || 'Surname')
export const req = (c) => CATS.filter((k) => (k[0] !== '2.2' || c.name_changed) && (k[0] !== '2.5' || c.is_male))
export const reqd = (c) => req(c).filter((k) => !k[5])
// a category is satisfied when it has a file that is not rejected
export const okCat = (docs, c, k) => docs.some((d) => d.category === k[0] && d.status !== 'fix')
export const sexTh = (c) => (c.is_male ? 'เพศชาย' : 'เพศหญิง')
// how the ID card was redacted: tool = redaction tool in the browser, self = candidate confirmed they did it (or the card has no such data)
export const redactTxt = (d) => (d.redaction === 'tool' ? `ปิดบังด้วยเครื่องมือ ${d.redaction_boxes || ''} จุด` : d.redaction === 'self' ? 'แคนดิเดตยืนยันว่าปิดบังแล้วหรือบัตรไม่มีข้อมูลนี้' : 'ยังไม่ได้ยืนยันเรื่องการปิดบัง')
export const fdt = (s) => (s ? new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
// Other Documents: the title typed after upload becomes the file name ("สรุปสำนวนคดี - Name Surname.pdf"); numbered only when two files share a title
const otKey = (d) => (d.title || '').trim() || '\u0000' + (d.original_name || '')
export function otName(c, d, l, prefix) {
  const same = l.filter((x) => otKey(x) === otKey(d)), n = same.length > 1 ? ` (${same.indexOf(d) + 1})` : ''
  const t = safeName(d.title)
  if (t) return t.slice(0, 80) + ' - ' + base(c) + n + '.' + d.ext
  const ob = safeName((d.original_name || '').replace(/\.[^.]+$/, '')).slice(0, 60) || 'file'
  return prefix + ' - ' + base(c) + ' - ' + ob + n + '.' + d.ext
}
const safeName = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
// auto file name; `list` = the files that share numbering (same candidate)
export function fname(c, d, list) {
  const l = list.filter((x) => x.category === d.category)
  const n = l.length > 1 ? ` (${l.indexOf(d) + 1})` : ''
  if (d.category === 'ROT') return otName(c, d, l, 'Other Documents (Recruiter)')
  if (RC[d.category]) return rname(c, d, n)
  if (d.category === 'OT') return otName(c, d, l, 'Other Documents')
  if (d.category === 'OT-old') {
    const ob = (d.original_name || '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'file'
    return 'Other Documents - ' + base(c) + ' - ' + ob + n + '.' + d.ext
  }
  return nm(d.category) + C[d.category][1].replace(/[\\/:*?"<>|]/g, '') + ' - ' + base(c) + n + '.' + d.ext
}

// ===================== Recruiter-side checklist =====================
// [code, English name, Thai name, hint, allowed ext, optional?, file-number prefix]
// The number prefix is only used in file names ("1-5. AOU (B But Clear) - Name Surname.pdf"); change it here if the numbering differs.
export const RCATS = [
  ['SRF', 'SRF', 'SRF ที่ได้อนุมัติแล้ว', '', ['pdf'], false, '1-1.'],
  ['APP', 'Application', 'ใบสมัคร', '', ['pdf'], false, '1-2.'],
  ['CV', 'CV or Resume', 'CV หรือ Resume', '', ['pdf'], true, '1-2.'],
  ['OFF', 'Offer Form', 'แบบฟอร์ม offer สำหรับ Non-Sales', '', ['pdf'], true, '1-3.'],
  ['OSU', 'Offer Summary', 'สรุป offer ใบเหลืองที่ accept offer แล้ว', '', ['pdf'], false, '1-4.'],
  ['AOU', 'AOU', 'ผลตรวจเช็ค AOU', 'เลือกสถานะผลตรวจ ซึ่งจะแสดงในชื่อไฟล์', ['pdf'], false, '1-5.'],
  ['EML', 'Email B But Clear', 'อีเมลยืนยัน B But Clear จากคุณอเนก', 'แนบเมื่อผล AOU เป็น B But Clear', ['pdf'], true, '1-5.'],
  ['RHC', 'Rehire Checking', 'ตรวจเช็ค Rehire', 'เลือก New Hire หรือ Rehire ซึ่งจะแสดงในชื่อไฟล์', ['pdf'], false, '1-5.'],
  ['RHD', 'Rehire & Deviate Form', 'แบบฟอร์ม Rehire', 'ต้องแนบเมื่อเลือก Rehire', ['pdf'], false, '1-5.'],
  ['ROT', 'Other Documents (Recruiter)', 'เอกสารอื่นๆ', 'ส่งได้หลายไฟล์', ['pdf'], true, ''],
]
export const RC = Object.fromEntries(RCATS.map((k) => [k[0], k]))
export const C = Object.fromEntries([...CATS, ...RCATS].map((k) => [k[0], k]))
export const isR = (code) => !!RC[code]
export const AOU = { b: 'B', b_clear: 'B But Clear', normal: 'Normal', not_found: 'Not Found' }
export const REHIRE = { new_hire: 'New Hire', rehire: 'Rehire' }
export const rlbl = (k) => (k[6] ? k[6] + ' ' : '') + k[1] + ' (' + k[2] + ')'
const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim()
// the rehire form is only relevant when the candidate is marked Rehire
export const rreq = (c, docs = []) => RCATS.filter((k) => k[0] !== 'RHD' || c.rehire_status === 'rehire' || docs.some((d) => d.category === 'RHD'))
export const rreqd = (c) => RCATS.filter((k) => !k[5] && (k[0] !== 'RHD' || c.rehire_status === 'rehire'))
// satisfied = has a file (no review step on this side); AOU / Rehire Checking also need their status chosen
export const okR = (docs, c, k) =>
  docs.some((d) => d.category === k[0]) && (k[0] !== 'AOU' || !!c.aou_status) && (k[0] !== 'RHC' || !!c.rehire_status)
export function rname(c, d, n = '') {
  const k = RC[d.category], p = k[6] ? k[6] + ' ' : ''
  if (d.category === 'ROT') {
    const ob = safe((d.original_name || '').replace(/\.[^.]+$/, '')).slice(0, 60) || 'file'
    return 'Other Documents (Recruiter) - ' + base(c) + ' - ' + ob + n + '.' + d.ext
  }
  let t = k[1]
  if (d.category === 'AOU' && c.aou_status) t += ' (' + AOU[c.aou_status] + ')'
  if (d.category === 'RHC' && c.rehire_status) t += ' (' + REHIRE[c.rehire_status] + ')'
  return p + t + ' - ' + base(c) + n + '.' + d.ext
}
