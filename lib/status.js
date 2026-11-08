// Document status logic shown to HR and candidates
// Missing = no file yet · Received = file in, HR has not opened it · Pending = HR opened it, no decision yet
// Verified = approved · Revision = HR asked for a corrected file
export const DS = {
  missing: ['Missing', 'ยังไม่ได้รับ', 'g'],
  received: ['Received', 'ได้รับไฟล์แล้ว', 'n'],
  pending: ['Pending', 'รอตรวจ', ''],
  verified: ['Verified', 'ตรวจผ่าน', 'ok'],
  revision: ['Revision Required', 'ต้องแก้ไข', 'bad'],
}
export const dsLabel = (k) => DS[k][0] + ' · ' + DS[k][1]

// one file
export const docStatus = (d) => (d.status === 'ok' ? 'verified' : d.status === 'fix' ? 'revision' : d.opened_at ? 'pending' : 'received')
// all active files of one category
export function catStatus(l) {
  if (!l.length) return 'missing'
  const s = l.map(docStatus)
  if (s.includes('revision')) return 'revision'
  if (s.every((x) => x === 'verified')) return 'verified'
  return s.includes('received') ? 'received' : 'pending'
}

// version chain of an active file, oldest first, ending with the file itself. hist = superseded files
export function chainOf(d, hist) {
  const by = Object.fromEntries(hist.map((x) => [x.id, x]))
  const out = [d]
  let cur = d
  while (cur.replaces && by[cur.replaces]) { cur = by[cur.replaces]; out.unshift(cur) }
  return out
}
export const EV = { upload: 'อัปโหลดไฟล์', revise: 'อัปโหลดฉบับแก้ไข', approve: 'Verified · ตรวจผ่าน', request_revision: 'Revision Required · ขอให้แก้ไข', reopen: 'ยกเลิกผลตรวจ (กลับเป็นรอตรวจ)', comment: 'ความเห็น' }
