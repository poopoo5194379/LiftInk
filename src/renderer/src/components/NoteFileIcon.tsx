import { useId } from 'react'
import mark from '../assets/liftink-mark.svg'

export default function NoteFileIcon({ kind = 'note', size = 26 }: { kind?: string; size?: number }): React.JSX.Element {
  const gradient = useId()
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs><linearGradient id={gradient} x2="1" y2="1"><stop stopColor="#f5ecff"/><stop offset="1" stopColor="#e4cef9"/></linearGradient></defs>
    <path d="M8 2h11l7 7v19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill={`url(#${gradient})`} stroke="#a880cf" />
    <path d="M19 2v5a2 2 0 0 0 2 2h5" fill="none" stroke="#a880cf" />
    {kind === 'pdf' ? <text x="16" y="22" textAnchor="middle" fontSize="7" fontWeight="750" fill="#683b98">PDF</text>
      : kind === 'image' ? <path d="m10 23 4-5 3 3 3-4 3 6Z" fill="#8c58c5" />
      : <image href={mark} x="9" y="11" width="15" height="15" />}
  </svg>
}
