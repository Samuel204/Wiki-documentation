import type { WikiFile } from '../types/wiki'

interface SidebarProps {
    categories: string[]
    files: WikiFile[]
    activeFileId: string | null
    search: string
    collapsed: boolean
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

function BookIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
    )
}

function CollapseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
    )
}

function ClockIcon() {
    return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" />
            <polyline points="12 8 12 12 15 14" />
        </svg>
    )
}

function FolderIcon() {
    return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

function FileIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    )
}

function PlusIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function UploadIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <polyline points="7 8 12 3 17 8" />
            <path d="M5 21h14" />
        </svg>
    )
}

function DownloadIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <path d="M12 15V3" />
        </svg>
    )
}

function ExportIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
            <path d="M3.3 8.5l8.7 5 8.7-5" />
            <path d="M12 21.5V13" />
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="14" y2="14" />
            <line x1="14" y1="4" x2="4" y2="14" />
        </svg>
    )
}

export function Sidebar({
                            categories,
                            files,
                            activeFileId,
                            search,
                            collapsed,
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
    const recentFiles = files
        .filter((file) => file.recentlyOpenedAt)
        .sort(
            (a, b) => (b.recentlyOpenedAt ?? 0) - (a.recentlyOpenedAt ?? 0),
        )
        .slice(0, 2)

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <strong>
                    <BookIcon />
                    Argomenti
                </strong>

                <button
                    className="icon-button sidebar-collapse-button"
                    type="button"
                    title="Comprimi sidebar"
                    onClick={onToggleCollapse}
                >
                    <CollapseIcon />
                </button>
            </div>

            <label className="search-field">
                <span className="sr-only">Cerca file</span>
                <input
                    type="search"
                    value={search}
                    placeholder="Cerca file..."
                    onChange={(event) => onSearchChange(event.target.value)}
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
                                    className={`file-item ${
                                        activeFileId === file.id ? 'active' : ''
                                    }`}
                                    key={`recent-${file.id}`}
                                    type="button"
                                    onClick={() => onSelectFile(file.id)}
                                >
                                    <FileIcon />
                                    <span className="file-name">{file.title}</span>
                                    <span className="file-category">
                                        {file.category}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {categories.map((category) => {
                    const categoryFiles = files.filter(
                        (file) => file.category === category,
                    )
                    const isCollapsed = collapsedCategories[category] ?? true

                    return (
                        <section className="category-block" key={category}>
                            <div
                                className={`category-heading ${
                                    isCollapsed ? 'collapsed' : ''
                                }`}
                                role="button"
                                tabIndex={0}
                                onClick={() => onToggleCategory(category)}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                    ) {
                                        event.preventDefault()
                                        onToggleCategory(category)
                                    }
                                }}
                            >
                                <span className="category-chevron" aria-hidden="true">
                                    ▾
                                </span>
                                <FolderIcon />
                                <span className="category-name">{category}</span>
                                <span className="category-count">
                                    {categoryFiles.length}
                                </span>

                                {adminMode && (
                                    <button
                                        className="delete-category"
                                        type="button"
                                        title={`Elimina ${category}`}
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onDeleteCategory(category)
                                        }}
                                    >
                                        <CloseIcon />
                                    </button>
                                )}
                            </div>

                            {!isCollapsed && (
                                <div className="file-list">
                                    {categoryFiles.map((file) => (
                                        <button
                                            className={`file-item ${
                                                activeFileId === file.id
                                                    ? 'active'
                                                    : ''
                                            }`}
                                            key={file.id}
                                            type="button"
                                            onClick={() => onSelectFile(file.id)}
                                        >
                                            <FileIcon />
                                            <span className="file-name">
                                                {file.title}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                    )
                })}
            </div>

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
        </aside>
    )
}