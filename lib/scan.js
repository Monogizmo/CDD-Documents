// Browser-side document scanning helpers (no libraries): fit, rotate, guess page edges, perspective crop, clean-up filters.
// A "quad" is 4 corner points [[x, y] x4] in 0..1 of the image, in the order top-left, top-right, bottom-right, bottom-left.

export function fitCanvas(img, max = 2400) {
  const r = Math.min(1, max / Math.max(img.width, img.height))
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(img.width * r)); cv.height = Math.max(1, Math.round(img.height * r))
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
  return cv
}

// dir = 1 clockwise, -1 counter-clockwise
export function rotateCanvas(cv, dir) {
  const o = document.createElement('canvas'); o.width = cv.height; o.height = cv.width
  const g = o.getContext('2d'); g.translate(o.width / 2, o.height / 2); g.rotate((dir * Math.PI) / 2); g.drawImage(cv, -cv.width / 2, -cv.height / 2)
  return o
}
export function rotateQuad(q, dir) {
  if (dir === 1) { const n = q.map(([x, y]) => [1 - y, x]); return [n[3], n[0], n[1], n[2]] }
  const n = q.map(([x, y]) => [y, 1 - x]); return [n[1], n[2], n[3], n[0]]
}

export const defaultQuad = (m = 0.04) => [[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]]

// Guess where the page is: brighter area (paper) against a darker background -> bounding box. The user can always drag the corners.
export function detectQuad(src) {
  try {
    const r = 160 / Math.max(src.width, src.height), w = Math.max(8, Math.round(src.width * r)), h = Math.max(8, Math.round(src.height * r))
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h), hist = new Array(256).fill(0)
    for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; gray[i] = v; hist[v]++ }
    // Otsu threshold
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]
    let wB = 0, sB = 0, best = -1, t = 128
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue
      const wF = w * h - wB; if (!wF) break
      sB += i * hist[i]
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF)
      if (v > best) { best = v; t = i }
    }
    const col = new Array(w).fill(0), row = new Array(h).fill(0)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (gray[y * w + x] > t) { col[x]++; row[y]++ }
    const first = (a, n) => a.findIndex((v) => v > 0.12 * n)
    const x0 = first(col, h), x1 = w - 1 - first([...col].reverse(), h), y0 = first(row, w), y1 = h - 1 - first([...row].reverse(), w)
    if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) return defaultQuad()
    const frac = ((x1 - x0) * (y1 - y0)) / (w * h)
    if (frac < 0.25 || frac > 0.9) return defaultQuad()
    const px = 1 / w, py = 1 / h
    return [[x0 * px, y0 * py], [(x1 + 1) * px, y0 * py], [(x1 + 1) * px, (y1 + 1) * py], [x0 * px, (y1 + 1) * py]]
  } catch { return defaultQuad() }
}

// solve 8x8 linear system (Gauss elimination with pivoting)
function solve(A, b) {
  const n = b.length
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    ;[A[i], A[p]] = [A[p], A[i]]; ;[b[i], b[p]] = [b[p], b[i]]
    const d = A[i][i] || 1e-12
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / d; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i] }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-12) }
  return x
}

// Crop the quad out of `src` and flatten it to a rectangle (perspective correction). Longest side of the result <= maxSide.
export function warp(src, quad, maxSide = 1700) {
  const P = quad.map(([x, y]) => [x * src.width, y * src.height]), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  let W = Math.max(dist(P[0], P[1]), dist(P[3], P[2])), H = Math.max(dist(P[0], P[3]), dist(P[1], P[2]))
  const k = Math.min(1, maxSide / Math.max(W, H, 1)); W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k))
  const D = [[0, 0], [W, 0], [W, H], [0, H]], A = [], b = []
  for (let i = 0; i < 4; i++) {
    const [u, v] = D[i], [x, y] = P[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y)
  }
  const h = solve(A, b)
  const sg = src.getContext('2d', { willReadFrequently: true }), sd = sg.getImageData(0, 0, src.width, src.height), s = sd.data, sw = src.width, sh = src.height
  const out = document.createElement('canvas'); out.width = W; out.height = H
  const og = out.getContext('2d'), od = og.createImageData(W, H), o = od.data
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const z = h[6] * i + h[7] * j + 1, x = (h[0] * i + h[1] * j + h[2]) / z, y = (h[3] * i + h[4] * j + h[5]) / z
      const xi = Math.max(0, Math.min(sw - 2, Math.floor(x))), yi = Math.max(0, Math.min(sh - 2, Math.floor(y)))
      const fx = Math.max(0, Math.min(1, x - xi)), fy = Math.max(0, Math.min(1, y - yi))
      const a = (yi * sw + xi) * 4, c = a + sw * 4, q = (j * W + i) * 4
      for (let ch = 0; ch < 3; ch++) {
        const top = s[a + ch] * (1 - fx) + s[a + 4 + ch] * fx, bot = s[c + ch] * (1 - fx) + s[c + 4 + ch] * fx
        o[q + ch] = top * (1 - fy) + bot * fy
      }
      o[q + 3] = 255
    }
  }
  og.putImageData(od, 0, 0)
  return out
}

// mode: 'color' (as is) | 'gray' (grey + stronger contrast) | 'bw' (scanner look: even white background)
export function applyFilter(cv, mode) {
  if (mode === 'color') return cv
  const w = cv.width, h = cv.height, g = cv.getContext('2d', { willReadFrequently: true }), id = g.getImageData(0, 0, w, h), d = id.data
  const gray = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0
  if (mode === 'gray') {
    const hist = new Array(256).fill(0); gray.forEach((v) => hist[v]++)
    const n = w * h; let a = 0, lo = 0, hi = 255
    for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= n * 0.02) { lo = i; break } }
    a = 0; for (let i = 255; i >= 0; i--) { a += hist[i]; if (a >= n * 0.02) { hi = i; break } }
    const span = Math.max(30, hi - lo)
    for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(255, ((gray[i] - lo) / span) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v }
  } else {
    // estimate the lighting (paper colour) with a very blurry copy, then divide it out
    const sm = document.createElement('canvas'); sm.width = Math.max(2, Math.round(w / 24)); sm.height = Math.max(2, Math.round(h / 24))
    const sg = sm.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(cv, 0, 0, sm.width, sm.height)
    const bg = document.createElement('canvas'); bg.width = w; bg.height = h
    const bgc = bg.getContext('2d', { willReadFrequently: true }); bgc.imageSmoothingQuality = 'high'; bgc.drawImage(sm, 0, 0, w, h)
    const b = bgc.getImageData(0, 0, w, h).data
    for (let i = 0; i < w * h; i++) {
      const bv = Math.max(40, b[i * 4] * 0.299 + b[i * 4 + 1] * 0.587 + b[i * 4 + 2] * 0.114), n = gray[i] / bv
      const v = Math.max(0, Math.min(255, ((n - 0.55) / (0.92 - 0.55)) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
    }
  }
  g.putImageData(id, 0, 0)
  return cv
}

// canvas -> JPEG blob that carries its size (b.w / b.h) like lib/images.js toJpg(), so mkPdf() can use it
export function canvasBlob(cv, q = 0.82) {
  return new Promise((ok) => cv.toBlob((b) => { b.w = cv.width; b.h = cv.height; ok(b) }, 'image/jpeg', q))
}
