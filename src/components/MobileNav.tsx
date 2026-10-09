// src/components/MobileNav.tsx
export type MobilePanel = 'doc' | 'playground'

interface MobileNavProps {
    active: MobilePanel
    onChange: (panel: MobilePanel) => void
}

export function MobileNav({ active, onChange }: MobileNavProps) {
    return (
        <nav className="mobile-nav" aria-label="Sezioni">
            <button
                type="button"
                className={active === 'doc' ? 'active' : ''}
                aria-pressed={active === 'doc'}
                onClick={() => onChange('doc')}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Documentazione
            </button>

            <button
                type="button"
                className={`playground ${active === 'playground' ? 'active' : ''}`}
                aria-pressed={active === 'playground'}
                onClick={() => onChange('playground')}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <ellipse cx="12" cy="12" rx="10" ry="4.2" />
                    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)" />
                    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)" />
                    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                </svg>
                Playground
            </button>
        </nav>
    )
}