import './globals.css'
import { Noto_Sans_Thai } from 'next/font/google'
const font = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'] })
export const metadata = { title: 'Candidate Document Portal' }
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }
export default function RootLayout({ children }) {
  return (<html lang="th"><body className={font.className}>{children}</body></html>)
}
