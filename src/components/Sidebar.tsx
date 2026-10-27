import type { WikiFile } from '../types/wiki'
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'
import {
    ClockIcon,
    CloseSmallIcon,
    CollapseIcon,
    DownloadIcon,
    ExportIcon,
    FileIcon,
    FolderIcon,
    OutlineIcon,
    PlusIcon,
    UploadIcon,
} from './icons'

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
                                                <CloseSmallIcon />
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