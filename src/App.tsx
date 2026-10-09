import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { DocumentPanel } from './components/DocumentPanel'
import {PlaygroundPanel, type PlaygroundPanelHandle} from './components/PlaygroundPanel.tsx'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { SettingsModal } from './components/modals/SettingsModal'
import { exportAllFiles, exportFile } from './lib/export'
import { useWikiState } from './hooks/useWikiState'
import { useGithubSync } from './hooks/useGithubSync'
import type { AppMode } from './types/wiki'

export default function App() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [search, setSearch] = useState('')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [collapsedCategories, setCollapsedCategories] = useState<
        Record<string, boolean>
    >({})
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
        status: syncStatus,
        ready,
        setMode,
        pull,
        schedulePush,
        updateSettings,
        resetSettings,
        createGist,
    } = useGithubSync({
        state,
        onRemoteData: applyRemoteData,
    })

    // Pull iniziale non appena le impostazioni cifrate sono pronte.
    useEffect(() => {
        if (ready) {
            void pull()
        }
    }, [ready, pull])

    // Ad ogni modifica dello stato (in admin) pianifica un push con debounce.
    useEffect(() => {
        schedulePush()
    }, [state, schedulePush])

    const visibleFiles = useMemo(() => {
        const query = search.trim().toLowerCase()

        if (!query) {
            return files
        }

        return files.filter((file) =>
            `${file.title} ${file.category}`.toLowerCase().includes(query),
        )
    }, [files, search])

    function handleModeChange(nextMode: AppMode) {
        if (nextMode === 'admin' && mode === 'viewer') {
            // L'ingresso in Admin richiede un token: apri le impostazioni.
            setSettingsOpen(true)
            return
        }

        if (nextMode === 'viewer' && mode === 'admin') {
            if (!window.confirm('Uscire dalla modalità Admin?')) {
                return
            }
            setMode('viewer')
        }
    }

    function handleCreateCategory() {
        const name = window.prompt('Nome della nuova categoria')

        if (name) {
            createCategory(name)
        }
    }

    function handleDeleteCategory(category: string) {
        const categoryFiles = files.filter((file) => file.category === category)
        const message = categoryFiles.length
            ? `Eliminare "${category}" e i suoi ${categoryFiles.length} file?`
            : `Eliminare la categoria "${category}"?`

        if (window.confirm(message)) {
            deleteCategory(category)
        }
    }

    function handleUploadClick() {
        uploadInputRef.current?.click()
    }

    function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const selectedFiles = Array.from(event.target.files ?? [])

        selectedFiles.forEach((file) => {
            const reader = new FileReader()

            reader.addEventListener('load', () => {
                const content = typeof reader.result === 'string' ? reader.result : ''
                const title = file.name.replace(/\.(md|markdown)$/i, '')

                addFile(title, content)
            })

            reader.readAsText(file)
        })

        event.target.value = ''
    }

    function handleExportCurrent() {
        if (activeFile) {
            exportFile(activeFile)
        }
    }

    function handleExportAll() {
        exportAllFiles(files)
    }

    function handleToggleCategory(category: string) {
        setCollapsedCategories((current) => ({
            ...current,
            [category]: !current[category],
        }))
    }

    return (
        <div className={`app-shell mode-${mode}`}>
            <TopBar
                mode={mode}
                syncStatus={syncStatus}
                onModeChange={handleModeChange}
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
            />

            <main className="app-layout">
                <Sidebar
                    categories={categories}
                    files={visibleFiles}
                    activeFileId={activeFileId}
                    search={search}
                    collapsed={sidebarCollapsed}
                    adminMode={mode === 'admin'}
                    collapsedCategories={collapsedCategories}
                    onToggleCategory={handleToggleCategory}
                    onToggleCollapse={() =>
                        setSidebarCollapsed((value) => !value)
                    }
                    onSearchChange={setSearch}
                    onSelectFile={setActiveFileId}
                    onCreateCategory={handleCreateCategory}
                    onDeleteCategory={handleDeleteCategory}
                    onUpload={handleUploadClick}
                    onExportCurrent={handleExportCurrent}
                    onExportAll={handleExportAll}
                />

                <DocumentPanel
                    file={activeFile}
                    categories={categories}
                    adminMode={mode === 'admin'}
                    onUpdate={updateFile}
                    onDelete={deleteFile}
                    onOpenInPlayground={(code) => playgroundRef.current?.loadCode(code)}
                />

                <PlaygroundPanel
                    ref={playgroundRef}
                    code={state.playground.code}
                    onChange={updatePlayground}
                />
            </main>

            {settingsOpen && (
                <SettingsModal
                    settings={settings}
                    onClose={() => setSettingsOpen(false)}
                    onUpdateSettings={updateSettings}
                    onResetSettings={resetSettings}
                    onCreateGist={createGist}
                    onSaved={() => {
                        void pull()
                    }}
                    onCleared={() => setMode('viewer')}
                />
            )}

            <input
                ref={uploadInputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                multiple
                hidden
                onChange={handleUpload}
            />
        </div>
    )
}