// src/components/TopBar.tsx
import type { AppMode, SyncInfo } from '../types/wiki'

interface TopBarProps {
    mode: AppMode
    sync: SyncInfo
    onModeChange: (mode: AppMode) => void
    onOpenSettings: () => void
    onToggleSidebar: () => void
}

export function TopBar({ mode, sync, onModeChange, onOpenSettings, onToggleSidebar }: TopBarProps) {
    return (
        <header className="topbar">
            <button
                className="icon-button topbar-menu"
                type="button"
                title="Menu"
                aria-label="Mostra/nascondi argomenti"
                onClick={onToggleSidebar}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
            </button>

            <div className="brand">
                <span className="brand-dot" />
                <span className="brand-label">Learning Wiki</span>
            </div>

            <div
                className={`mode-switch ${mode}`}
                role="group"
                aria-label="Modalità"
                title="Cambia modalità"
            >
                <span className="mode-switch-knob" aria-hidden="true" />
                {(['viewer', 'admin'] as const).map((option) => (
                    <button
                        key={option}
                        className={`mode-opt ${mode === option ? 'active' : ''}`}
                        type="button"
                        aria-pressed={mode === option}
                        onClick={() => onModeChange(option)}
                    >
                        {option === 'viewer' ? 'Viewer' : 'Admin'}
                    </button>
                ))}
            </div>

            <div className="topbar-spacer" />

            <button
                className={`sync-status status-${sync.status}`}
                type="button"
                title={sync.detail ?? 'Apri impostazioni sincronizzazione'}
                aria-label={`Sincronizzazione: ${sync.text}. Apri impostazioni`}
                onClick={onOpenSettings}
            >
                <span className="sync-dot" />
                <span className="sync-text">{sync.text}</span>
            </button>
        </header>
    )
}