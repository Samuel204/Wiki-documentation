import { useMemo, useRef, useState } from 'react'
import './App.css'
import { DocumentPanel } from './components/DocumentPanel'
import { PlaygroundPanel } from './components/PlaygroundPanel.tsx'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { SettingsModal } from './components/modals/SettingsModal'
import { exportAllFiles, exportFile } from './lib/export'
import { useWikiState } from './hooks/useWikiState'
import type { AppMode, SyncStatus } from './types/wiki'

export default function App() {
    const [mode, setMode] = useState<AppMode>('viewer')
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [search, setSearch] = useState('')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [collapsedCategories, setCollapsedCategories] = useState<
        Record<string, boolean>
    >({})
    const uploadInputRef = useRef<HTMLInputElement>(null)

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
    } = useWikiState()

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
            setMode('admin')
            return
        }

        if (nextMode === 'viewer' && mode === 'admin') {
            if (!window.confirm('Uscire dalla modalità Admin?')) {
                return
            }
        }

        setMode(nextMode)
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
                    onOpenInPlayground={updatePlayground}
                />

                <PlaygroundPanel
                    code={state.playground.code}
                    onChange={updatePlayground}
                />
            </main>

            {settingsOpen && (
                <SettingsModal
                    onClose={() => setSettingsOpen(false)}
                    onSaved={() => setSyncStatus('synced')}
                    onCleared={() => setSyncStatus('idle')}
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