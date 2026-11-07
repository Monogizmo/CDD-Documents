'use client'
// Candidate photo (700x900 portrait) or initials when there is no photo yet
export default function Avatar({ url, name, size = 44, portrait }) {
  const ini = (name || '').split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase() || '?'
  const st = { width: size, height: portrait ? Math.round((size * 9) / 7) : size, fontSize: Math.round(size / 2.6) }
  return url
    ? <img className={'av' + (portrait ? ' sq' : '')} src={url} alt={name || 'photo'} style={st} />
    : <span className={'av' + (portrait ? ' sq' : '')} style={st} aria-label="ยังไม่มีรูป">{ini}</span>
}
