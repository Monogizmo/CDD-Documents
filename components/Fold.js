'use client'
import { useState } from 'react'
// Collapsible block: long sections stay folded until needed
export default function Fold({ title, badge, defaultOpen = false, children, small }) {
  const [o, setO] = useState(defaultOpen)
  return (
    <section className={'fold' + (small ? ' sm' : '')}>
      <button type="button" className="foldh" aria-expanded={o} onClick={() => setO(!o)}>
        <span className="chev">{o ? '▾' : '▸'}</span><b>{title}</b>{badge}
      </button>
      {o && <div className="foldb">{children}</div>}
    </section>
  )
}
