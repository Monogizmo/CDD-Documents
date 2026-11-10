// Read text out of a file so its category can be guessed from the CONTENT:
// 1) PDF text layer (instant, offline)  2) OCR (tesseract.js, Thai + English) for scanned PDFs and photos, loaded only when needed.
// The OCR language data is downloaded once (about 10 MB) and cached by the browser.
import { loadImg } from './images'
import { fitCanvas } from './scan'

let worker = null
async function ocrWorker(onStatus) {
  if (!worker) {
    onStatus?.('กำลังโหลดตัวอ่านภาษาไทย (ครั้งแรกเท่านั้น)...')
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('tha+eng', 1, { logger: (m) => { if (m.status === 'recognizing text') onStatus?.('กำลังอ่านไฟล์สแกน ' + Math.round((m.progress || 0) * 100) + '%') } })
  }
  return worker
}
export async function stopOcr() {
  if (!worker) return
  const w = worker; worker = null
  try { await w.terminate() } catch { /* ignore */ }
}

async function openPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}
async function pdfText(doc, maxPages = 3) {
  let t = ''
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    t += ' ' + tc.items.map((x) => x.str).join(' ')
  }
  return t
}
async function pdfCanvas(doc, n = 1, scale = 2) {
  const pg = await doc.getPage(n), vp = pg.getViewport({ scale })
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height)
  await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise
  return cv
}

// returns { text, via: 'text' | 'ocr' | 'none' }; never throws (a locked or broken file just gives no text)
export async function readText(file, { ocr = true, onStatus } = {}) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  try {
    let cv = null
    if (ext === 'pdf') {
      const doc = await openPdf(file), text = await pdfText(doc)
      if (text.replace(/\s/g, '').length >= 40) return { text, via: 'text' }
      if (!ocr) return { text: '', via: 'none' }
      cv = await pdfCanvas(doc, 1, 2)
    } else if (/^(jpe?g|png)$/.test(ext)) {
      if (!ocr) return { text: '', via: 'none' }
      cv = fitCanvas(await loadImg(file), 1800)
    } else return { text: '', via: 'none' }
    const w = await ocrWorker(onStatus), r = await w.recognize(cv)
    return { text: r.data.text || '', via: 'ocr' }
  } catch { return { text: '', via: 'none' } }
}

// Page-by-page text of a PDF (used to split one big scan into separate documents).
// -> { n: total pages, pages: [{ text, via: 'text' | 'ocr' | 'none' }] } (only the first maxPages pages are read) | { n, pages, stopped: true } | null when the file cannot be opened
export async function readPdfPages(file, { ocr = true, onStatus, shouldStop, maxPages = 40 } = {}) {
  try {
    const doc = await openPdf(file), n = doc.numPages, lim = Math.min(n, maxPages), pages = []
    for (let i = 1; i <= lim; i++) {
      if (shouldStop && shouldStop()) return { n, pages, stopped: true }
      let text = '', via = 'text'
      try { text = (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') } catch { text = '' }
      if (text.replace(/\s/g, '').length < 25) {
        if (!ocr) via = 'none'
        else {
          onStatus?.('กำลังอ่านหน้า ' + i + '/' + lim + ' ของไฟล์สแกน')
          try { const w = await ocrWorker(onStatus), r = await w.recognize(await pdfCanvas(doc, i, 2)); text = r.data.text || ''; via = 'ocr' } catch { text = ''; via = 'none' }
        }
      }
      pages.push({ text, via })
    }
    return { n, pages }
  } catch { return null }
}
