import { useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import './styles/shell.css'
import { DocumentPanel } from './components/DocumentPanel'
import { MobileNav, type MobilePanel } from './components/MobileNav'
import { PanelResizer } from './components/PanelResizer'
import { PlaygroundPanel, type PlaygroundPanelHandle } from './components/PlaygroundPanel'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { CategoryModal } from './components/modals/CategoryModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { useGithubSync } from './hooks/useGithubSync'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useWikiState } from './hooks/useWikiState'
import { exportAllFiles, exportFile } from './lib/export'
import { STORAGE_KEYS } from './lib/storage'
import type { AppMode } from './types/wiki'

const MOBILE_QUERY = '(max-width: 980px)'
const PLAYGROUND_MIN_WIDTH = 320
const PLAYGROUND_MAX_RATIO = 0.7

function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeStorage(key: string, value: string | null): void {
    try {
        if (value === null) {
            localStorage.removeItem(key)
        } else {
            localStorage.setItem(key, value)
        }
    } catch {
        // storage non disponibile
    }
}

function readPlaygroundWidth(): number | null {
    // formato legacy: "520px"
    const value = parseFloat(readStorage(STORAGE_KEYS.layout) ?? '')
    return Number.isFinite(value) && value > 0 ? value : null
}

export default function App() {
    const isMobile = useMediaQuery(MOBILE_QUERY)

    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        () => readStorage(STORAGE_KEYS.sidebar) === '1',
    )
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [mobilePanel, setMobilePanel] = useState<MobilePanel>('doc')
    const [playgroundWidth, setPlaygroundWidth] = useState<number | null>(readPlaygroundWidth)
    const [search, setSearch] = useState('')
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [setupDismissed, setSetupDismissed] = useState(false)
    const [categoryModalOpen, setCategoryModalOpen] = useState(false)

    const layoutRef = useRef<HTMLElement>(null)
    const uploadInputRef = useRef<HTMLInputElement>(null)
    const playgroundRef = useRef<PlaygroundPanelHandle>(null)

    const {
        state,
        files,
        categories,
        activeFile,
        activeFileId,
        setActiveFileId,
        updateFile,
        addFile,
        createCategory,
        deleteCategory,
        deleteFile,
        updatePlayground,
        applyRemoteData,
    } = useWikiState()

    const {
        settings,
        mode,
        sync,
        lastError,
        needsSetup,
        connect,
        createGist,
        exitAdmin,
        resetSettings,
    } = useGithubSync({ state, onRemoteData: applyRemoteData })

    const adminMode = mode === 'admin'
    const query = search.trim().toLowerCase()
    const visibleFiles = query
        ? files.filter((file) => file.title.toLowerCase().includes(query))
        : files

    // Senza alcun Gist configurato la finestra si apre al primo avvio (come la versione legacy).
    const showSettings = settingsOpen || (needsSetup && !setupDismissed)

    /* ---------------- Sidebar ---------------- */
    function toggleSidebar() {
        if (isMobile) {
            setMobileSidebarOpen((open) => !open)
            return
        }
        const next = !sidebarCollapsed
        setSidebarCollapsed(next)
        writeStorage(STORAGE_KEYS.sidebar, next ? '1' : '0')
    }

    function handleToggleCategory(category: string) {
        setCollapsedCategories((current) => ({
            ...current,
            // undefined = chiusa (default)
            [category]: !(current[category] ?? true),
        }))
    }

    function selectFile(id: string) {
        setActiveFileId(id)
        setMobileSidebarOpen(false)
        setMobilePanel('doc')
    }

    function handleDeleteCategory(category: string) {
        const count = files.filter((file) => file.category === category).length
        const message = count
            ? `Eliminare la categoria "${category}" e i suoi ${count} file?`
            : `Eliminare la categoria "${category}"?`

        if (window.confirm(message)) {
            deleteCategory(category)
        }
    }

    /* ---------------- Modalità ---------------- */
    function handleModeChange(next: AppMode) {
        if (next === mode) {
            return
        }
        if (next === 'admin') {
            // Admin richiede un token verificato: si attiva dal modal.
            setSettingsOpen(true)
            return
        }
        if (window.confirm('Uscire dalla modalità Admin e tornare a Viewer?')) {
            void exitAdmin()
        }
    }

    function closeSettings() {
        setSettingsOpen(false)
        setSetupDismissed(true)
    }

    /* ---------------- Upload / Export ---------------- */
    function handleUploadClick() {
        uploadInputRef.current?.click()
    }

    async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
        const selected = Array.from(event.target.files ?? [])
        event.target.value = ''

        const loaded = await Promise.all(
            selected.map(async (file) => ({
                title: file.name.replace(/\.(md|markdown)$/i, ''),
                content: await file.text(),
            })),
        )

        let lastId: string | null = null
        for (const item of loaded) {
            lastId = addFile(item.title, item.content)
        }

        if (lastId) {
            setActiveFileId(lastId)
            setMobilePanel('doc')
            setMobileSidebarOpen(false)
        }
    }

    async function handleExportAll() {
        if (files.length === 0) {
            window.alert('Non ci sono file da esportare.')
            return
        }
        try {
            await exportAllFiles(files)
        } catch (err) {
            console.error(err)
            window.alert('Esportazione non riuscita.')
        }
    }

    /* ---------------- Playground ---------------- */
    function openInPlayground(code: string) {
        playgroundRef.current?.loadCode(code)
        setMobilePanel('playground')
    }

    return (
        <div className={`app-shell mode-${mode}`}>
            <TopBar
                mode={mode}
                sync={sync}
                onModeChange={handleModeChange}
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleSidebar={toggleSidebar}
            />

            <main className="app-layout" ref={layoutRef}>
                {isMobile && mobileSidebarOpen && (
                    <div className="sidebar-overlay visible" onClick={() => setMobileSidebarOpen(false)} />
                )}

                <Sidebar
                    categories={categories}
                    files={visibleFiles}
                    activeFileId={activeFileId}
                    search={search}
                    collapsed={!isMobile && sidebarCollapsed}
                    mobileOpen={isMobile && mobileSidebarOpen}
                    searching={query !== ''}
                    adminMode={adminMode}
                    collapsedCategories={collapsedCategories}
                    onToggleCategory={handleToggleCategory}
                    onToggleCollapse={toggleSidebar}
                    onSearchChange={setSearch}
                    onSelectFile={selectFile}
                    onCreateCategory={() => setCategoryModalOpen(true)}
                    onDeleteCategory={handleDeleteCategory}
                    onUpload={handleUploadClick}
                    onExportCurrent={() => activeFile && exportFile(activeFile)}
                    onExportAll={() => void handleExportAll()}
                />

                <DocumentPanel
                    className={mobilePanel === 'doc' ? 'mobile-active' : undefined}
                    file={activeFile}
                    categories={categories}
                    adminMode={adminMode}
                    onUpdate={updateFile}
                    onDelete={deleteFile}
                    onUpload={handleUploadClick}
                    onOpenInPlayground={openInPlayground}
                />

                <PanelResizer
                    containerRef={layoutRef}
                    minWidth={PLAYGROUND_MIN_WIDTH}
                    maxRatio={PLAYGROUND_MAX_RATIO}
                    onResize={setPlaygroundWidth}
                    onResizeEnd={() =>
                        writeStorage(STORAGE_KEYS.layout, playgroundWidth ? `${playgroundWidth}px` : null)
                    }
                    onReset={() => {
                        setPlaygroundWidth(null)
                        writeStorage(STORAGE_KEYS.layout, null)
                    }}
                />

                <PlaygroundPanel
                    ref={playgroundRef}
                    className={mobilePanel === 'playground' ? 'mobile-active' : undefined}
                    style={playgroundWidth ? { flex: `0 0 ${playgroundWidth}px` } : undefined}
                    code={state.playground.code}
                    onChange={updatePlayground}
                />
            </main>

            <MobileNav active={mobilePanel} onChange={setMobilePanel} />

            {showSettings && (
                <SettingsModal
                    settings={settings}
                    lastError={lastError}
                    onClose={closeSettings}
                    onConnect={connect}
                    onCreateGist={createGist}
                    onReset={resetSettings}
                />
            )}

            {categoryModalOpen && (
                <CategoryModal
                    existing={categories}
                    onClose={() => setCategoryModalOpen(false)}
                    onConfirm={createCategory}
                />
            )}

            <input
                ref={uploadInputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                multiple
                hidden
                onChange={(event) => void handleUpload(event)}
            />
        </div>
    )
}