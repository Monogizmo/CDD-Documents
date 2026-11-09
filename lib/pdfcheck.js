// PDF Checker & Automation Prep (ported from HR Document Hub): check file name / size / PDF structure before the file goes into
// an automation (Power Automate, Outlook ...), then fix what can be fixed in the browser. Nothing is uploaded anywhere.
import { getPdfjs, isPasswordErr, flattenPdf } from './pdf'
import { loadImg, mkPdf } from './images'

export const ALLOWED = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg']
export const IMG = ['png', 'jpg', 'jpeg']
export const DEFAULTS = { lim: 10, b64: true, ascii: true, maxLen: 100, strategy: 'raster', needWord: true, imgToPdf: false }
const STEPS = [[2, 0.8], [1.5, 0.7], [1.2, 0.55], [1, 0.4], [0.8, 0.3]] // [render scale, jpeg quality], from best to smallest

export const mb = (b) => (b / 1048576).toFixed(2) + ' MB'
export const ext = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '')
export const stem = (n) => (n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : n)
const eff = (cfg, s) => (cfg.b64 ? (s * 4) / 3 : s)           // size after Base64 (+33%) when a flow sends the file as Base64
const limB = (cfg) => (cfg.lim || 10) * 1048576

export function safeName(n, cfg) {
  const e = ext(n)
  let b = stem(n)
  b = cfg.ascii ? b.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_') : b.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, '_')
  b = b.replace(/_+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '').slice(0, Math.max(10, cfg.maxLen - 6))
  if (!b) { const d = new Date(), p = (x) => String(x).padStart(2, '0'); b = 'document_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) }
  return b + '.' + (e || 'pdf')
}

async function magic(f, e) {
  const h = new Uint8Array(await f.slice(0, 8).arrayBuffer()), is = (...b) => b.every((x, i) => h[i] === x)
  if (e === 'pdf') return null
  if (e === 'png') return is(0x89, 0x50, 0x4e, 0x47)
  if (e === 'jpg' || e === 'jpeg') return is(0xff, 0xd8, 0xff)
  if (e === 'docx' || e === 'xlsx') return is(0x50, 0x4b)
  return is(0xd0, 0xcf, 0x11, 0xe0)
}

// -> { r: [{ s: 'ok'|'wn'|'er', t, d }], e, review: [], nameBad, sizeBad, magicBad, pdf, pdfBad, pw, word, signed, enc }
export async function analyze(f, cfg) {
  const r = [], add = (s, t, d) => r.push({ s, t, d }), e = ext(f.name), o = { r, e, review: [] }
  if (!f.name.trim() || !f.name.includes('.') || f.name.endsWith('.')) add('er', 'ชื่อไฟล์ว่างหรือไม่มีนามสกุล')
  else if (!ALLOWED.includes(e)) add('er', 'ชนิดไฟล์ .' + e + ' ไม่รองรับ', 'รองรับ: ' + ALLOWED.join(', '))
  else add('ok', 'ชนิดไฟล์ .' + e + ' รองรับ')
  const bad = []
  if (/[\\/:*?"<>|\x00-\x1f]/.test(f.name)) bad.push('มีอักขระต้องห้ามหรืออักขระที่ใช้เป็นพาธ')
  else if (cfg.ascii && /[^A-Za-z0-9._-]/.test(f.name)) bad.push('มีอักษรไทย ช่องว่าง หรืออักขระพิเศษ')
  if (f.name.length > cfg.maxLen) bad.push('ชื่อยาวเกิน ' + cfg.maxLen + ' ตัวอักษร')
  bad.length ? add('er', 'ชื่อไฟล์ไม่ผ่านกฎ', bad.join(' / ')) : add('ok', 'ชื่อไฟล์ผ่านกฎ')
  o.nameBad = bad.length > 0 && f.name.includes('.')
  const es = eff(cfg, f.size)
  o.sizeBad = es > limB(cfg)
  if (f.size === 0) add('er', 'ไฟล์ว่าง (0 ไบต์)')
  else if (o.sizeBad) add('er', 'ไฟล์ใหญ่เกินลิมิต', 'จริง ' + mb(f.size) + ' / ประมาณเมื่อเข้ารหัส ' + mb(es))
  else add('ok', 'ขนาดผ่าน', 'จริง ' + mb(f.size) + ' / ประมาณเมื่อเข้ารหัส ' + mb(es))
  if (ALLOWED.includes(e) && f.size > 0) {
    const m = await magic(f, e)
    if (m === false) add('er', 'เนื้อไฟล์ไม่ตรงกับนามสกุล .' + e, 'ลายเซ็นไฟล์ไม่ตรง อาจเป็นไฟล์ผิดชนิดหรือเสียหาย')
    o.magicBad = m === false
  }
  if (e === 'pdf' && f.size > 0 && !o.magicBad) {
    const buf = await f.arrayBuffer(), head = new TextDecoder().decode(buf.slice(0, 1024))
    if (!head.includes('%PDF')) { add('er', 'โครงสร้าง PDF ผิดปกติ', 'ไม่พบส่วนหัว %PDF'); o.pdfBad = true }
    else {
      try {
        const pdfjs = await getPdfjs()
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
        add('ok', 'เปิด PDF ได้ปกติ', pdf.numPages + ' หน้า'); o.pdf = true
        const inf = ((await pdf.getMetadata()).info) || {}
        o.word = /microsoft/i.test((inf.Producer || '') + ' ' + (inf.Creator || ''))
        const raw = f.size < 80e6 ? new TextDecoder('latin1').decode(buf) : '', ver = (head.match(/%PDF-(\d\.\d)/) || [])[1] || '?', fl = []
        if (/\/Sig\b/.test(raw)) { fl.push('ลายเซ็นดิจิทัล'); o.signed = true }
        if (/\/AcroForm/.test(raw)) fl.push('ฟอร์ม')
        if (/\/XFA/.test(raw)) { fl.push('XFA'); o.review.push('XFA') }
        if (/\/EmbeddedFile/.test(raw)) { fl.push('ไฟล์แนบฝัง'); o.review.push('ไฟล์แนบ') }
        if (/\/JavaScript|\/JS\b/.test(raw)) { fl.push('JavaScript'); o.review.push('JavaScript') }
        if (/\/Encrypt/.test(raw)) { fl.push('เข้ารหัส/จำกัดสิทธิ์'); o.enc = true }
        if (o.signed) o.review.push('ลายเซ็นดิจิทัล')
        add(o.word ? 'ok' : 'wn', 'PDF ' + ver + ' | Producer: ' + (inf.Producer || '-') + ' | Creator: ' + (inf.Creator || '-'),
          (o.word ? 'metadata ระบุว่ามาจาก Microsoft (ใช้เป็นตัวบ่งชี้เท่านั้น)' : 'metadata ไม่ได้ระบุ Microsoft') + (fl.length ? ' | พบตัวบ่งชี้: ' + fl.join(', ') : ''))
        if (o.signed) add('wn', 'พบตัวบ่งชี้ลายเซ็นดิจิทัล', 'การสร้าง PDF ใหม่จะทำให้ลายเซ็นใช้ไม่ได้')
        if (o.review.length) add('wn', 'ควรตรวจด้วยตนเอง', o.review.join(', '))
      } catch (x) {
        o.pdfBad = true; o.pw = isPasswordErr(x)
        add('er', o.pw ? 'PDF มีรหัสผ่าน ต้องปลดล็อกก่อน' : 'เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหาย')
      }
    }
  }
  if (['doc', 'docx', 'xls', 'xlsx'].includes(e)) add('wn', 'ไฟล์ Office ตรวจได้แค่ชื่อ ชนิด ขนาด และลายเซ็นไฟล์', 'ไม่ได้ตรวจเนื้อหาข้างใน')
  return o
}

// what to do with a file: null | 'name' | 'clean' | 'raster'   and the resulting state
export function plan(a, cfg) {
  let m = null
  if (a.pdf) {
    const need = a.sizeBad || (cfg.needWord && !a.word)
    if (need && cfg.strategy !== 'rename') m = a.sizeBad && cfg.strategy === 'clean' ? 'clean' : (a.sizeBad ? 'raster' : cfg.strategy)
    else if (a.nameBad) m = 'name'
  } else if (IMG.includes(a.e) && !a.magicBad && (a.sizeBad || cfg.imgToPdf)) m = 'raster'
  else if (a.nameBad && ALLOWED.includes(a.e) && !a.magicBad) m = 'name'
  return { mode: m, state: m ? 'fix' : a.r.some((x) => x.s === 'er') ? 'er' : a.review.length ? 'review' : 'ok' }
}

// give every item its output name; duplicates get _2, _3 ...
export function assignNames(items, cfg) {
  const used = new Set()
  return items.map((it) => {
    if (!it.a) return it
    let n = it.manual || (it.mode ? safeName(it.file.name, cfg) : it.file.name)
    if (!it.manual && (it.mode === 'raster' || it.mode === 'clean')) n = stem(n) + '.pdf'
    const b = n; let i = 2, d = false
    while (used.has(n.toLowerCase())) { n = stem(b) + '_' + i + (ext(b) ? '.' + ext(b) : ''); i++; d = true }
    used.add(n.toLowerCase())
    const upd = d && !it.mode && (it.state === 'ok' || it.state === 'review') ? { mode: 'name', state: 'fix' } : {}
    return { ...it, name: n, dup: d, ...upd }
  })
}

async function imgPdf(file, q) {
  const img = await loadImg(file), r = Math.min(1, 2400 / Math.max(img.width, img.height))
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r)
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height)
  const b = await new Promise((ok) => cv.toBlob((x) => { x.w = cv.width; x.h = cv.height; ok(x) }, 'image/jpeg', q))
  return mkPdf([b])
}

// fix one item -> { out: File, mode, note, a2 }   (throws on failure)
export async function fixOne(it, cfg, { onProg, shouldStop } = {}) {
  let blob = it.file, mode = it.mode, note = ''
  if (mode === 'clean') {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(await it.file.arrayBuffer(), { ignoreEncryption: true }), out = await PDFDocument.create()
    ;(await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p))
    out.setProducer(''); out.setCreator('')
    blob = new Blob([await out.save()], { type: 'application/pdf' })
    if (eff(cfg, blob.size) > limB(cfg)) { mode = 'raster'; note = 'ยังเกินลิมิต จึงเปลี่ยนเป็นแปลงเป็นภาพ' }
  }
  if (mode === 'raster') {
    for (const [s, q] of STEPS) {
      blob = it.a.pdf ? await flattenPdf(it.file, { scale: s, q, maxPages: 200, onPage: (i, n) => onProg && onProg('หน้า ' + i + '/' + n), shouldStop }) : await imgPdf(it.file, q)
      if (eff(cfg, blob.size) <= limB(cfg)) break
    }
  }
  const name = mode === 'raster' || mode === 'clean' ? stem(it.name) + '.pdf' : it.name
  const out = new File([blob], name, { type: blob.type || it.file.type })
  return { out, mode, note, name, a2: await analyze(out, cfg) }
}
