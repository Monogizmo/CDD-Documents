// [code, English name, Thai name, hint, allowed ext, optional?]
export const CATS = [
  ['2.1', 'ID Card', 'บัตรประชาชน', 'ต้องลบศาสนาและกรุ๊ปเลือดก่อนอัปโหลด', ['pdf', 'jpg']],
  ['2.2', 'Name & Surname Change', 'ใบเปลี่ยนชื่อหรือนามสกุล', 'เฉพาะผู้ที่เคยเปลี่ยนชื่อหรือนามสกุล', ['pdf']],
  ['2.3', 'House Registration', 'ทะเบียนบ้าน', '', ['pdf']],
  ['2.4', 'Transcript', 'ใบเกรด', 'ต้องมีวันจบการศึกษาระบุ', ['pdf']],
  ['2.5', 'Military Certificate', 'ใบ สด.8 หรือ สด.43', 'เฉพาะผู้ชาย', ['pdf']],
  ['2.6', 'Health Check Report', 'ผลตรวจสุขภาพ', '', ['pdf']],
  ['2.7', 'Receipt', 'ใบเสร็จผลตรวจสุขภาพ', '', ['pdf', 'jpg'], true],
  ['2.8', 'Krungsri Passbook', 'หน้าสมุดบัญชีกรุงศรี', 'บัญชีที่ยังใช้งานอยู่', ['pdf', 'jpg']],
  ['PH', 'Photo', 'รูปถ่ายพนักงาน', 'รูปถ่ายหน้าตรงหรือเอียงข้างเล็กน้อย', ['jpg']],
  ['PS', 'Pay Slip', 'สลิปเงินเดือน / ทวิ 50 / ใบรับรองเงินเดือน', '', ['pdf'], true],
  ['OT', 'Other Documents', 'เอกสารอื่นๆ', 'เอกสารอื่นที่ต้องการแนบเพิ่ม ไม่ใช่เอกสารตามรายการด้านบน (ส่งได้หลายไฟล์)', ['pdf', 'jpg'], true],
]
export const C = Object.fromEntries(CATS.map((k) => [k[0], k]))
export const nm = (k) => (/^\d\.\d$/.test(k) ? k.replace('.', '-') + ' ' : '')
export const lbl = (k) => nm(k[0]) + k[1] + ' (' + k[2] + ')'
const clean = (s) => {
  s = (s || '').replace(/[^A-Za-z\- ]/g, '').trim()
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
export const base = (c) => (clean(c.first_name) || 'Name') + ' ' + (clean(c.last_name) || 'Surname')
export const req = (c) => CATS.filter((k) => (k[0] !== '2.2' || c.name_changed) && (k[0] !== '2.5' || c.is_male))
export const reqd = (c) => req(c).filter((k) => !k[5])
// a category is satisfied when it has a file that is not rejected (ID card also needs the redaction confirmation)
export const okCat = (docs, c, k) =>
  docs.some((d) => d.category === k[0] && d.status !== 'fix') && (k[0] !== '2.1' || c.id_redacted)
// auto file name; `list` = the files that share numbering (same candidate)
export function fname(c, d, list) {
  const l = list.filter((x) => x.category === d.category)
  const n = l.length > 1 ? ` (${l.indexOf(d) + 1})` : ''
  if (d.category === 'OT') {
    const ob = (d.original_name || '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'file'
    return 'Other Documents - ' + base(c) + ' - ' + ob + n + '.' + d.ext
  }
  return nm(d.category) + C[d.category][1].replace(/[\\/:*?"<>|]/g, '') + ' - ' + base(c) + n + '.' + d.ext
}
