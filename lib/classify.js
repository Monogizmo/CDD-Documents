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
