// Split one PDF that holds several documents (e.g. ID card + house registration + transcript scanned into one file)
// into separate PDFs. Pages are classified one by one (lib/classify.js guessText); a new document starts when a page clearly belongs to another category.
import { guessText } from './classify'

// pages: [{ text }] -> [{ from, to, code, sure }] (1-based, inclusive)
export function segmentPages(pages, allowed) {
  const segs = []
  pages.forEach((p, i) => {
    const g = guessText(p.text, allowed), last = segs[segs.length - 1]
    if (!last) { segs.push({ from: i + 1, to: i + 1, code: g.code, sure: g.sure }); return }
    if (g.code && g.code !== last.code) {
      if (!last.code) { last.code = g.code; last.sure = g.sure; last.to = i + 1 }          // pages before the first recognised page (cover, blank) join it
      else if (g.sure) segs.push({ from: i + 1, to: i + 1, code: g.code, sure: true })     // only a clear match starts a new document; a weak one is treated as a continuation page
      else last.to = i + 1
    } else { last.to = i + 1; if (g.code && g.sure) last.sure = true }
  })
  return segs
}

// "1-3, 5" -> [0,1,2,4] (0-based) | null when the text is not a valid range for n pages
export function parseRanges(txt, n) {
  const out = []
  for (const part of String(txt || '').split(',')) {
    const t = part.trim(); if (!t) continue
    const m = t.match(/^(\d+)\s*(?:-\s*(\d+))?$/)
    if (!m) return null
    const a = +m[1], b = m[2] ? +m[2] : a
    if (a < 1 || b < a || b > n) return null
    for (let i = a; i <= b; i++) if (!out.includes(i - 1)) out.push(i - 1)
  }
  return out.length ? out : null
}
export const fmtRange = (a, b) => (a === b ? String(a) : a + '-' + b)

// new PDF with only the given pages (0-based). Falls back to re-drawing the pages as pictures when pdf-lib cannot copy them.
export async function cutPdf(file, idx, name) {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }), out = await PDFDocument.create()
    ;(await out.copyPages(src, idx)).forEach((pg) => out.addPage(pg))
    return new File([await out.save()], name, { type: 'application/pdf' })
  } catch {
    const { getPdfjs } = await import('./pdf'), { mkPdf } = await import('./images')
    const pdfjs = await getPdfjs(), doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, blobs = []
    for (const i of idx) {
      const pg = await doc.getPage(i + 1), vp = pg.getViewport({ scale: 2 })
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height)
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height)
      await pg.render({ canvasContext: g, viewport: vp }).promise
      blobs.push(await new Promise((ok) => cv.toBlob((b) => { b.w = cv.width; b.h = cv.height; ok(b) }, 'image/jpeg', 0.85)))
    }
    return new File([await mkPdf(blobs)], name, { type: 'application/pdf' })
  }
}
