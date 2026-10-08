// src/components/TopBar.tsx

import type { AppMode, SyncStatus } from '../types/wiki'

interface TopBarProps {
    mode: AppMode
    syncStatus: SyncStatus
    onModeChange: (mode: AppMode) => void
    onOpenSettings: () => void
    onToggleSidebar: () => void
}

const syncLabels: Record<SyncStatus, string> = {
    idle: 'non configurato',
    syncing: 'sincronizzazione...',
    synced: 'sincronizzato',
    error: 'errore',
}

export function TopBar({
                           mode,
                           syncStatus,
                           onModeChange,
                           onOpenSettings,
                           onToggleSidebar,
                       }: TopBarProps) {
    return (
        <header className="topbar">
            <button
                className="icon-button"
                type="button"
                title="Menu"
                aria-label="Apri menu"
                onClick={onToggleSidebar}
            >
                ☰
            </button>

            <div className="brand">
                <span className="brand-dot" />
                <span className="brand-label">Learning Wiki</span>
            </div>

            <div
                className={`mode-switch ${mode === 'admin' ? 'admin' : 'viewer'}`}
                role="group"
                aria-label="Modalità"
            >
                <span className="mode-switch-knob" aria-hidden="true" />
                <button
                    className={`mode-opt ${mode === 'viewer' ? 'active' : ''}`}
                    type="button"
                    aria-pressed={mode === 'viewer'}
                    onClick={() => onModeChange('viewer')}
                >
                    Viewer
                </button>

                <button
                    className={`mode-opt ${mode === 'admin' ? 'active' : ''}`}
                    type="button"
                    aria-pressed={mode === 'admin'}
                    onClick={() => onModeChange('admin')}
                >
                    Admin
                </button>
            </div>

            <div className="topbar-spacer" />

            <button
                className={`sync-status status-${syncStatus}`}
                type="button"
                onClick={onOpenSettings}
            >
                <span className="sync-dot" />
                {syncLabels[syncStatus]}
            </button>
        </header>
    )
}