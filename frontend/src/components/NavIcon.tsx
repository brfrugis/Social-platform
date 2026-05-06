import type { NavId } from '../navConfig'

const svgProps = {
  className: 'nav-icon',
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.45,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export default function NavIcon({ id }: { id: NavId }) {
  switch (id) {
    case 'studio':
      return (
        <svg {...svgProps} aria-hidden>
          <rect x="4" y="4.5" width="12" height="4" rx="1" />
          <rect x="4" y="11.5" width="12" height="4" rx="1" />
          <path d="M7 6.5h6M7 13.5h4" opacity="0.45" />
        </svg>
      )
    case 'translate':
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M4 6h12M4 10h10M4 14h8" />
          <path d="M14 10l2.5 4M14 10l2.5-4" />
        </svg>
      )
    case 'templates':
      return (
        <svg {...svgProps} aria-hidden>
          <line x1="5" y1="5.5" x2="15" y2="5.5" />
          <line x1="5" y1="8.5" x2="15" y2="8.5" />
          <line x1="5" y1="11.5" x2="12" y2="11.5" />
          <line x1="5" y1="14.5" x2="15" y2="14.5" />
        </svg>
      )
    case 'library':
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M6 4.5h8a1 1 0 011 1v10a1 1 0 01-1 1H6a1 1 0 01-1-1v-10a1 1 0 011-1z" />
          <path d="M7.5 7.5h5M7.5 10h5M7.5 12.5h3" opacity="0.5" />
        </svg>
      )
    case 'workspace':
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M4 9.5l6-4 6 4v6.5a1 1 0 01-1 1h-3v-4H8v4H5a1 1 0 01-1-1V9.5z" />
          <path d="M9 17v-4h2v4" opacity="0.45" />
        </svg>
      )
    case 'integrations':
      return (
        <svg {...svgProps} aria-hidden>
          <circle cx="7" cy="7" r="2.25" />
          <circle cx="14.5" cy="13.5" r="2.25" />
          <path d="M9 8.5l5 4M11 11.5l4-4" opacity="0.55" />
        </svg>
      )
    case 'news':
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M5 5.5h10v9H5z" opacity="0.35" />
          <path d="M5 7.5h10M8 10h4M8 12.5h6" />
          <path d="M14 4v3h3" opacity="0.65" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...svgProps} aria-hidden>
          <circle cx="10" cy="10" r="2.25" />
          <path
            d="M10 3.5v1.2M10 15.3v1.2M16.2 10h-1.2M5 10H3.8M14.4 5.6l-.85.85M6.45 13.55l-.85.85M14.4 14.4l-.85-.85M6.45 6.45l-.85-.85"
            opacity="0.85"
          />
        </svg>
      )
    default:
      return null
  }
}
