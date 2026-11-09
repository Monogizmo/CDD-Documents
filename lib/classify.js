// Guess which category a file belongs to from its file name (the user can always correct it in the review step)
// Returns { code, sure } or { code: '', sure: false }
const norm = (s) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[_\-.()\[\]]+/g, ' ').replace(/\s+/g, ' ').trim()

// number prefix we use in our own file names: "2-3 House Registration..." / "1-4. Offer Summary..."
const PREFIX = { '2-1': '2.1', '2-2': '2.2', '2-3': '2.3', '2-4': '2.4', '2-5': '2.5', '2-6': '2.6', '2-7': '2.7', '2-8': '2.8', '1-1': 'SRF', '1-3': 'OFF', '1-4': 'OSU' }

// more specific rules first; the first match wins. [code, regex]
const RULES = [
  ['RHD', /rehire.*deviat|deviat|แบบฟอร์ม ?rehire/],
  ['RHC', /rehire|re hire|new hire|ตรวจ ?rehire/],
  ['EML', /(email|e mail|อีเมล|mail).*(clear)|(clear).*(email|mail)|อเนก/],
  ['AOU', /\baou\b|ผลตรวจ ?aou/],
  ['OSU', /offer ?summary|สรุป ?offer|ใบเหลือง|yellow/],
  ['OFF', /offer ?form|แบบฟอร์ม ?offer|non ?sale/],
  ['SRF', /\bsrf\b|staff ?requisition|ใบขออัตรา/],
  ['APP', /application|ใบสมัคร|app ?form/],
  ['CV', /\bcv\b|resume|résumé|เรซูเม่|เรซูเม|ประวัติส่วนตัว/],
  ['2.1', /id ?card|บัตรประชาชน|บัตร ปชช|idcard|citizen/],
  ['2.2', /name ?change|surname ?change|เปลี่ยนชื่อ|เปลี่ยนนามสกุล/],
  ['2.3', /house ?reg|ทะเบียนบ้าน|tabien/],
  ['2.4', /transcript|ใบเกรด|ทรานสคริป|ใบรับรองผลการเรียน|degree|diploma/],
  ['2.5', /military|สด ?8|สด ?43|สด8|สด43|ทหาร/],
  ['2.7', /receipt|ใบเสร็จ/],
  ['2.6', /health|ตรวจสุขภาพ|medical|ผลตรวจ/],
  ['2.8', /krungsri|passbook|book ?bank|สมุดบัญชี|กรุงศรี|บัญชีธนาคาร/],
  ['PH', /photo|รูปถ่าย|รูป ?พนักงาน|portrait|headshot|\bpic\b/],
  ['PS', /pay ?slip|payslip|สลิป|ทวิ ?50|50 ?ทวิ|ใบรับรองเงินเดือน|salary/],
]

// `allowed` = set of category codes valid on this page (candidate side or recruiter side)
export function guess(file, allowed) {
  const raw = file.name, n = norm(raw)
  const m = raw.match(/^\s*(\d)\s*-\s*(\d)\b/)
  if (m) {
    const code = PREFIX[m[1] + '-' + m[2]]
    if (code && allowed.has(code)) return { code, sure: true }
  }
  for (const [code, re] of RULES) if (allowed.has(code) && re.test(n)) return { code, sure: true }
  return { code: '', sure: false }
}

// read the status out of a name like "1-5. AOU (B But Clear) - Name Surname"
export function parseAou(name) {
  const n = norm(name)
  if (/not ?found/.test(n)) return 'not_found'
  if (/b ?but ?clear|but ?but ?clear/.test(n)) return 'b_clear'
  if (/\(\s*b\s*\)/i.test(name)) return 'b'
  if (/\bnormal\b/.test(n)) return 'normal'
  return null
}
export function parseRehire(name) {
  const n = norm(name)
  if (/new ?hire/.test(n)) return 'new_hire'
  if (/\brehire\b|re ?hire/.test(n)) return 'rehire'
  return null
}

// ===================== Guess from the CONTENT of a file =====================
// text = what we could read from the file (PDF text layer, or OCR for scans / photos).
// Every category has weighted patterns; the best score wins. score >= 3 counts as "sure", 1-2 is a weak guess (shown for the user to check).
const normT = (s) => s.toLowerCase().replace(/[\u200b\u200c\u200d]/g, '').replace(/\s+/g, ' ')
// OCR often puts spaces inside Thai words, so Thai patterns are also tried on the text without spaces
const nos = (s) => s.replace(/\s+/g, '')
// [category, [[regex, weight, spaceless?], ...]]
const TEXT_RULES = [
  ['2.1', [[/บัตรประจำตัวประชาชน|thai national id|identification number|เลขประจำตัวประชาชน/, 3, 1], [/\b\d ?\d{4} ?\d{5} ?\d{2} ?\d\b/, 2], [/ศาสนา|หมู่โลหิต|religion|blood ?group/, 1, 1], [/วันออกบัตร|วันบัตรหมดอายุ|date of issue|date of expiry/, 1, 1]]],
  [ '2.2', [[/ใบสำคัญการเปลี่ยนชื่อ|การเปลี่ยนชื่อตัว|การเปลี่ยนชื่อสกุล|ใบเปลี่ยนชื่อ|เปลี่ยนนามสกุล|change of (first )?name/, 3, 1], [/ท\.?ร\.? ?(20|21|22|23)/, 1, 1]]],
  ['2.3', [[/ทะเบียนบ้าน|รหัสประจำบ้าน|เลขรหัสประจำบ้าน|house registration/, 3, 1], [/ท\.?ร\.? ?14|ท\.?ร\.? ?13/, 2, 1], [/เจ้าบ้าน|ที่อยู่ตามทะเบียนบ้าน/, 1, 1]]],
  ['2.4', [[/transcript|ใบแสดงผลการศึกษา|ระเบียนแสดงผลการเรียน|ใบรับรองผลการศึกษา|ใบรายงานผลการศึกษา/, 3, 1], [/เกรดเฉลี่ย|\bgpa\b|\bgpax\b|cumulative|หน่วยกิต|credits?/, 2, 1], [/วันสำเร็จการศึกษา|date of graduation|date of admission|degree|ปริญญา|bachelor|วุฒิการศึกษา/, 1, 1]]],
  ['2.5', [[/แบบ ?สด\.? ?8|สด\.? ?8\b|สด\.? ?43|ใบสำคัญ(ทหาร|ประจำตัว)|ทหารกองเกิน|ทหารกองหนุน|หนังสือสำคัญ/, 3, 1], [/กรมการสัสดี|สัสดี|กองประจำการ|พ้นราชการทหาร/, 2, 1]]],
  ['2.7', [[/ใบเสร็จรับเงิน|receipt|ใบกำกับภาษี|tax invoice/, 2, 1], [/โรงพยาบาล|hospital|clinic|คลินิก/, 1, 1], [/ตรวจสุขภาพ|health check|ค่าบริการ|ยอดชำระ|total amount|จำนวนเงิน/, 1, 1]]],
  ['2.6', [[/ผลตรวจสุขภาพ|ผลการตรวจสุขภาพ|health check ?(up)?|ใบรับรองแพทย์|medical certificate|ผลตรวจร่างกาย/, 3, 1], [/ความดันโลหิต|blood pressure|chest x-?ray|เอกซเรย์|\bcbc\b|ปัสสาวะ|urinalysis|cholesterol|คอเลสเตอรอล|น้ำตาลในเลือด|glucose|hemoglobin/, 2, 1], [/แพทย์|physician|ผลการตรวจ|lab result/, 1, 1]]],
  ['2.8', [[/กรุงศรี|krungsri|bank of ayudhya|\bbay\b/, 3, 1], [/เลขที่บัญชี|account (no|number)|ชื่อบัญชี|account name|สมุดบัญชี|passbook|บัญชีออมทรัพย์|savings account/, 2, 1], [/สาขา|branch|\bswift\b/, 1, 1]]],
  ['PS', [[/สลิปเงินเดือน|pay ?slip|payslip|salary slip/, 3, 1], [/50 ?ทวิ|ทวิ ?50|หนังสือรับรองการหักภาษี|withholding tax|ใบรับรองเงินเดือน|salary certificate|หนังสือรับรองเงินเดือน/, 3, 1], [/เงินเดือน|salary|รายได้สุทธิ|net pay|ประกันสังคม|social security/, 1, 1]]],
  ['PH', [[/photo|รูปถ่าย/, 1, 1]]],
  // recruiter side
  ['SRF', [[/\bsrf\b|staff requisition|ใบขออัตรากำลัง|ใบขออัตรา|ขออนุมัติอัตรากำลัง|manpower request|requisition/, 3, 1], [/approved|อนุมัติ|อัตราว่าง|vacancy|headcount/, 1, 1]]],
  ['APP', [[/application form|ใบสมัครงาน|ใบสมัคร|applicant/, 3, 1], [/ประวัติการศึกษา|ประวัติการทำงาน|ผู้ค้ำประกัน|บุคคลอ้างอิง|reference|expected salary|เงินเดือนที่ต้องการ/, 1, 1]]],
  ['CV', [[/curriculum vitae|\bresume\b|résumé|\bcv\b|เรซูเม่/, 3, 1], [/work experience|professional experience|skills|ประสบการณ์ทำงาน|ทักษะ|education|objective/, 1, 1]]],
  ['OFF', [[/offer form|แบบฟอร์ม ?offer|offer letter|แบบฟอร์มเสนอ|non ?sales?/, 3, 1], [/ตำแหน่ง|position|เงินเดือน|salary|start date|วันเริ่มงาน/, 1, 1]]],
  ['OSU', [[/offer summary|สรุป ?offer|สรุปการเสนอ|ใบเหลือง/, 3, 1], [/accept|ยอมรับ|เสนอเงินเดือน|offered salary/, 1, 1]]],
  ['AOU', [[/\baou\b|ผลตรวจ ?aou|aou check/, 3, 1], [/not found|but clear|\bnormal\b/, 1]]],
  ['EML', [[/but clear/, 2, 1], [/อเนก|from:|from :|ถึง:|subject|เรื่อง:|sent:|ส่งเมื่อ/, 1, 1]]],
  ['RHD', [[/rehire.{0,20}deviat|deviat|deviate form|แบบฟอร์ม ?rehire/, 3, 1]]],
  ['RHC', [[/rehire|re-hire|new hire|ตรวจ ?rehire|ประวัติการทำงานเดิม|เคยทำงาน/, 2, 1]]],
]

export function guessText(raw, allowed) {
  const t = normT(raw || ''), tn = nos(t)
  if (t.length < 12) return { code: '', sure: false, score: 0 }
  let best = '', top = 0
  for (const [code, pats] of TEXT_RULES) {
    if (!allowed.has(code)) continue
    let sc = 0
    for (const [re, w, sp] of pats) if (re.test(t) || (sp && re.test(tn))) sc += w
    if (sc > top) { top = sc; best = code }
  }
  // the receipt and the health report often share words: a "receipt" word wins for 2.7, a lab word for 2.6
  return top >= 2 ? { code: best, sure: top >= 3, score: top } : { code: '', sure: false, score: top }
}
