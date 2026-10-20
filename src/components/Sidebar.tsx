
import type { WikiFile } from '../types/wiki'
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'

type SidebarView = 'topics' | 'outline'
const VIEWS: SidebarView[] = ['topics', 'outline']

interface SidebarProps {
    outline: ReactNode
    categories: string[]
    files: WikiFile[]
    activeFileId: string | null
    search: string
    collapsed: boolean
    mobileOpen: boolean
    searching: boolean
    adminMode: boolean
    collapsedCategories: Record<string, boolean>
    onToggleCategory: (category: string) => void
    onToggleCollapse: () => void
    onSearchChange: (value: string) => void
    onSelectFile: (id: string) => void
    onCreateCategory: () => void
    onDeleteCategory: (category: string) => void
    onUpload: () => void
    onExportCurrent: () => void
    onExportAll: () => void
}

function CollapseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
    )
}

function FolderIcon({ size = 12 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

function OutlineIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M9 5h12M9 12h12M9 19h12" />
            <circle cx="3" cy="5" r="1" />
            <circle cx="3" cy="12" r="1" />
            <circle cx="3" cy="19" r="1" />
        </svg>
    )
}

function ClockIcon() {
    return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <polyline points="12 8 12 12 15 14" />
        </svg>
    )
}

function FileIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    )
}

function PlusIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function UploadIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <polyline points="7 8 12 3 17 8" />
            <path d="M5 21h14" />
        </svg>
    )
}

function DownloadIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <path d="M12 15V3" />
        </svg>
    )
}

function ExportIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
            <path d="M3.3 8.5l8.7 5 8.7-5" />
            <path d="M12 21.5V13" />
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="4" x2="14" y2="14" />
            <line x1="14" y1="4" x2="4" y2="14" />
        </svg>
    )
}

export function Sidebar({
                            outline,
                            categories,
                            files,
                            activeFileId,
                            search,
                            collapsed,
                            mobileOpen,
                            searching,
                            adminMode,
                            collapsedCategories,
                            onToggleCategory,
                            onToggleCollapse,
                            onSearchChange,
                            onSelectFile,
                            onCreateCategory,
                            onDeleteCategory,
                            onUpload,
                            onExportCurrent,
                            onExportAll,
                        }: SidebarProps) {
    const [view, setView] = useState<SidebarView>('topics')
    const baseId = useId()
    const tabRefs = useRef<Record<SidebarView, HTMLButtonElement | null>>({
        topics: null,
        outline: null,
    })

    const tabId = (v: SidebarView) => `${baseId}-tab-${v}`
    const panelId = (v: SidebarView) => `${baseId}-panel-${v}`

    function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const index = VIEWS.indexOf(view)
        let next: SidebarView | null = null

        if (event.key === 'ArrowRight') next = VIEWS[(index + 1) % VIEWS.length]
        else if (event.key === 'ArrowLeft') next = VIEWS[(index - 1 + VIEWS.length) % VIEWS.length]
        else if (event.key === 'Home') next = VIEWS[0]
        else if (event.key === 'End') next = VIEWS[VIEWS.length - 1]

        if (next) {
            event.preventDefault()
            setView(next)
            tabRefs.current[next]?.focus()
        }
    }

    const recentFiles = files
        .filter((file) => file.recentlyOpenedAt)
        .sort((a, b) => (b.recentlyOpenedAt ?? 0) - (a.recentlyOpenedAt ?? 0))
        .slice(0, 2)

    return (
        <aside
            className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        >
            {/* ── Header con tab + pulsante collapse ── */}
            <div className="sidebar-header">
                <div
                    className="sidebar-tab-bar"
                    role="tablist"
                    aria-label="Navigazione sidebar"
                    data-view={view}
                    onKeyDown={handleTabKeyDown}
                >
                    <button
                        ref={(el) => { tabRefs.current.topics = el }}
                        id={tabId('topics')}
                        className={`sidebar-tab topics-tab${view === 'topics' ? ' active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={view === 'topics'}
                        aria-controls={panelId('topics')}
                        tabIndex={view === 'topics' ? 0 : -1}
                        onClick={() => setView('topics')}
                    >
                        <FolderIcon size={16} />
                        <span className="sidebar-tab-label">Argomenti</span>
                    </button>

                    <button
                        ref={(el) => { tabRefs.current.outline = el }}
                        id={tabId('outline')}
                        className={`sidebar-tab outline-tab${view === 'outline' ? ' active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={view === 'outline'}
                        aria-controls={panelId('outline')}
                        tabIndex={view === 'outline' ? 0 : -1}
                        onClick={() => setView('outline')}
                    >
                        <OutlineIcon />
                        <span className="sidebar-tab-label">Outline</span>
                    </button>
                </div>

                <button
                    className="icon-button sidebar-collapse-button"
                    type="button"
                    title="Comprimi sidebar"
                    onClick={onToggleCollapse}
                >
                    <CollapseIcon />
                </button>
            </div>

            {/* ── Pannello contenuto ─�� */}
            <div className="sidebar-panel">

                {/* ── Vista Argomenti ── */}
                <div
                    id={panelId('topics')}
                    role="tabpanel"
                    aria-labelledby={tabId('topics')}
                    className="sidebar-tabpanel"
                    hidden={view !== 'topics'}
                >
                    <label className="search-field">
                        <span className="sr-only">Cerca file</span>
                        <input
                            type="search"
                            value={search}
                            placeholder="Cerca file..."
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </label>

                    <div className="category-list">
                        {recentFiles.length > 0 && (
                            <section className="recent-block">
                                <div className="category-heading recent-heading">
                                    <ClockIcon />
                                    <span>Recenti</span>
                                </div>
                                <div className="file-list recent-files">
                                    {recentFiles.map((file) => (
                                        <button
                                            key={`recent-${file.id}`}
                                            className={`file-item${activeFileId === file.id ? ' active' : ''}`}
                                            type="button"
                                            onClick={() => onSelectFile(file.id)}
                                        >
                                            <FileIcon />
                                            <span className="file-name">{file.title}</span>
                                            <span className="file-category">{file.category}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {categories.map((category) => {
                            const categoryFiles = files.filter((f) => f.category === category)

                            if (searching && categoryFiles.length === 0) return null

                            const isCategoryCollapsed = searching
                                ? false
                                : (collapsedCategories[category] ?? true)

                            return (
                                <section className="category-block" key={category}>
                                    <div
                                        className={`category-heading${isCategoryCollapsed ? ' collapsed' : ''}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onToggleCategory(category)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                onToggleCategory(category)
                                            }
                                        }}
                                    >
                                        <span className="category-chevron" aria-hidden="true">▾</span>
                                        <FolderIcon />
                                        <span className="category-name">{category}</span>
                                        <span className="category-count">{categoryFiles.length}</span>
                                        {adminMode && (
                                            <button
                                                className="delete-category"
                                                type="button"
                                                title={`Elimina ${category}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDeleteCategory(category)
                                                }}
                                            >
                                                <CloseIcon />
                                            </button>
                                        )}
                                    </div>

                                    {!isCategoryCollapsed && (
                                        <div className="file-list">
                                            {categoryFiles.map((file) => (
                                                <button
                                                    key={file.id}
                                                    className={`file-item${activeFileId === file.id ? ' active' : ''}`}
                                                    type="button"
                                                    onClick={() => onSelectFile(file.id)}
                                                >
                                                    <FileIcon />
                                                    <span className="file-name">{file.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )
                        })}

                        {searching && files.length === 0 && (
                            <div className="sidebar-empty">Nessun file trovato</div>
                        )}
                    </div>
                </div>

                {/* ── Vista Outline ── */}
                <div
                    id={panelId('outline')}
                    role="tabpanel"
                    aria-labelledby={tabId('outline')}
                    className="sidebar-tabpanel outline-tabpanel"
                    hidden={view !== 'outline'}
                >
                    <div className="outline-container">
                        {outline}
                    </div>
                </div>

                {/* ── Footer admin ── */}
                {adminMode && (
                    <footer className="sidebar-footer">
                        <button
                            className="side-btn new-category-button"
                            type="button"
                            onClick={onCreateCategory}
                        >
                            <PlusIcon />
                            Nuova categoria
                        </button>

                        <div className="footer-divider" />

                        <div className="footer-actions">
                            <button
                                className="side-btn footer-action"
                                type="button"
                                title="Carica file .md"
                                onClick={onUpload}
                            >
                                <UploadIcon />
                                <span className="btn-label">Carica</span>
                            </button>

                            <button
                                className="side-btn footer-action subtle"
                                type="button"
                                title="Esporta file corrente"
                                disabled={!activeFileId}
                                onClick={onExportCurrent}
                            >
                                <DownloadIcon />
                                <span className="btn-label">Download</span>
                            </button>

                            <button
                                className="side-btn footer-action subtle"
                                type="button"
                                title="Esporta tutti i file"
                                onClick={onExportAll}
                            >
                                <ExportIcon />
                                <span className="btn-label">Export</span>
                            </button>
                        </div>
                    </footer>
                )}
            </div>
        </aside>
    )
}