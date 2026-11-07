// Browser-side image helpers: load, compress, merge into PDF, photo 700x900
export function loadImg(file) {
  return new Promise((ok, no) => {
    const u = URL.createObjectURL(file), i = new Image()
    i.onload = () => { URL.revokeObjectURL(u); ok(i) }
    i.onerror = no
    i.src = u
  })
}
export function toJpg(img, rects) {
  const r = Math.min(1, 1600 / Math.max(img.width, img.height)), w = Math.round(img.width * r), h = Math.round(img.height * r)
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h)
  g.fillStyle = '#000'; (rects || []).forEach((q) => g.fillRect(q[0] * r, q[1] * r, q[2] * r, q[3] * r))
  return new Promise((ok) => cv.toBlob((b) => { b.w = w; b.h = h; ok(b) }, 'image/jpeg', 0.8))
}
export async function mkPdf(pg) {
  const bf = await Promise.all(pg.map((b) => b.arrayBuffer()))
  const en = new TextEncoder(), parts = [], off = [], n = pg.length
  let len = 0
  const add = (x) => { const u = typeof x === 'string' ? en.encode(x) : x; parts.push(u); len += u.length }
  const obj = (i, b) => { off[i] = len; add(i + ' 0 obj\n' + b + '\nendobj\n') }
  add('%PDF-1.4\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [' + pg.map((_, i) => 3 + i * 3 + ' 0 R').join(' ') + '] /Count ' + n + ' >>')
  pg.forEach((b, i) => {
    const a = 3 + i * 3, W = 595, H = 842, r = Math.min(W / b.w, H / b.h), w = Math.round(b.w * r), h = Math.round(b.h * r)
    const c = 'q ' + w + ' 0 0 ' + h + ' ' + Math.round((W - w) / 2) + ' ' + Math.round((H - h) / 2) + ' cm /Im Do Q'
    obj(a, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im ' + (a + 2) + ' 0 R >> >> /Contents ' + (a + 1) + ' 0 R >>')
    obj(a + 1, '<< /Length ' + c.length + ' >>\nstream\n' + c + '\nendstream')
    off[a + 2] = len
    add((a + 2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + b.w + ' /Height ' + b.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bf[i].byteLength + ' >>\nstream\n')
    add(new Uint8Array(bf[i])); add('\nendstream\nendobj\n')
  })
  const xr = len, t = 3 * n + 3
  add('xref\n0 ' + t + '\n0000000000 65535 f \n')
  for (let k = 1; k < t; k++) add(('0000000000' + off[k]).slice(-10) + ' 00000 n \n')
  add('trailer\n<< /Size ' + t + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF')
  return new Blob(parts, { type: 'application/pdf' })
}
export async function photoBlob(img) {
  const W = 700, H = 900, t = W / H, sw = img.width, sh = img.height
  let cw = sw, ch = sh
  if (sw / sh > t) cw = Math.round(sh * t); else ch = Math.round(sw / t)
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H)
  g.drawImage(img, Math.round((sw - cw) / 2), Math.round((sh - ch) * 0.3), cw, ch, 0, 0, W, H)
  let q = 0.97, b
  for (;;) { b = await new Promise((o) => cv.toBlob(o, 'image/jpeg', q)); if (b.size <= 2097152 || q < 0.5) break; q -= 0.1 }
  const warn = []
  if (Math.abs(sw / sh / t - 1) > 0.05) warn.push('ปรับสัดส่วนเป็น 700×900 ให้แล้ว (ตัดขอบอัตโนมัติ) ตรวจดูว่าใบหน้าอยู่กึ่งกลาง')
  if (sw < W || sh < H) warn.push('รูปมีความละเอียดต่ำกว่า 700×900 px อาจไม่ชัด')
  if (b.size < 307200) warn.push('ไฟล์เล็กกว่า 300 KB ตามเกณฑ์')
  return { blob: b, warn }
}
export async function isLocked(f) {
  return /\/Encrypt/.test(new TextDecoder('latin1').decode(new Uint8Array(await f.arrayBuffer())))
}
