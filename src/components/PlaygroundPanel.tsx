import {
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    type Ref,
} from 'react'
import { DEFAULT_PLAYGROUND_CODE } from '../hooks/useWikiState.ts'
import { CodeEditor, type CodeEditorHandle } from './playground/CodeEditor'
import { buildPreviewDocument, isPlaygroundMessage, type ExtraFile } from '../lib/playgroundPreview'
import type { PlaygroundExtraFile } from '../types/wiki'

const SAVE_DEBOUNCE_MS = 900
const FLASH_MS = 700
const SPLIT_MIN_HEIGHT = 110
const LS_PG_SPLIT = 'lw_pg_split_v1'

export interface PlaygroundPanelHandle {
    loadCode: (code: string) => void
    run: () => void
}

interface PlaygroundPanelProps {
    code: string
    extraFiles: PlaygroundExtraFile[]
    onChange: (code: string) => void
    onExtraFilesChange: (files: PlaygroundExtraFile[]) => void
    className?: string
    style?: CSSProperties
    ref?: Ref<PlaygroundPanelHandle>
}

interface ConsoleEntry {
    id: number
    type: 'log' | 'error'
    message: string
}

function createExtraFileId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function RunIcon() {
    return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
    )
}

function ResetIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
    )
}

function ConsoleIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
    )
}

function loadSplitHeight(): number | null {
    try {
        const value = Number(localStorage.getItem(LS_PG_SPLIT))
        return Number.isFinite(value) && value > 0 ? value : null
    } catch {
        return null
    }
}

const DEFAULT_EXTRA_CODE = `// Scrivi qui le tue funzioni o hook personalizzati.
// Sono disponibili globalmente in App.tsx.

function saluta(nome) {
  return \`Ciao, \${nome}!\`;
}
`

export function PlaygroundPanel({ code, extraFiles, onChange, onExtraFilesChange, className, style, ref }: PlaygroundPanelProps) {
    const [srcDoc, setSrcDoc] = useState(() => buildPreviewDocument(code))
    const [runId, setRunId] = useState(0)
    const [consoleVisible, setConsoleVisible] = useState(false)
    const [logs, setLogs] = useState<ConsoleEntry[]>([])
    const [savedLabel, setSavedLabel] = useState('—')
    const [flashing, setFlashing] = useState(false)
    const [editorHeight, setEditorHeight] = useState<number | null>(loadSplitHeight)
    const [draggingSplit, setDraggingSplit] = useState(false)
    // null = App.tsx principale, stringa = id del file extra attivo
    const [activeTabId, setActiveTabId] = useState<string | null>(null)

    const editorRef = useRef<CodeEditorHandle>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const splitRef = useRef<HTMLDivElement>(null)
    const consoleRef = useRef<HTMLDivElement>(null)
    const logIdRef = useRef(0)
    const onChangeRef = useRef(onChange)
    const onExtraFilesChangeRef = useRef(onExtraFilesChange)
    const lastEmittedRef = useRef(code)
    const pendingCodeRef = useRef<string | null>(null)
    const saveTimerRef = useRef<number | null>(null)
    const flashTimerRef = useRef<number | null>(null)
    // Mappa id → ref CodeEditor per leggere i valori aggiornati al Run
    const extraEditorsRef = useRef<Map<string, CodeEditorHandle>>(new Map())
    // Ref aggiornato ai file extra correnti senza causare re-render nei callback
    const extraFilesRef = useRef(extraFiles)

    useLayoutEffect(() => {
        onChangeRef.current = onChange
        onExtraFilesChangeRef.current = onExtraFilesChange
        extraFilesRef.current = extraFiles
    })

    /* ---------- Salvataggio App.tsx con debounce ---------- */
    const emit = useCallback((value: string) => {
        lastEmittedRef.current = value
        onChangeRef.current(value)
        setSavedLabel(`salvato · ${new Date().toLocaleTimeString()}`)
    }, [])

    const cancelPendingSave = useCallback(() => {
        if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        pendingCodeRef.current = null
    }, [])

    const flushPendingSave = useCallback(() => {
        const pending = pendingCodeRef.current
        cancelPendingSave()
        if (pending !== null) emit(pending)
    }, [cancelPendingSave, emit])

    const handleEditorChange = useCallback(
        (value: string, origin: string | undefined) => {
            if (origin === 'setValue') return
            pendingCodeRef.current = value
            setSavedLabel('modifiche non salvate...')
            if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
            saveTimerRef.current = window.setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS)
        },
        [flushPendingSave],
    )

    useEffect(() => {
        window.addEventListener('pagehide', flushPendingSave)
        return () => {
            window.removeEventListener('pagehide', flushPendingSave)
            flushPendingSave()
        }
    }, [flushPendingSave])

    // Codice App.tsx cambiato dall'esterno (pull dal Gist) → aggiorna editor
    useEffect(() => {
        if (code === lastEmittedRef.current) return
        lastEmittedRef.current = code
        cancelPendingSave()
        editorRef.current?.setValue(code)
    }, [code, cancelPendingSave])

    // File extra cambiati dall'esterno (pull dal Gist) → aggiorna gli editor
    const prevExtraFilesRef = useRef(extraFiles)
    useEffect(() => {
        const prev = prevExtraFilesRef.current
        prevExtraFilesRef.current = extraFiles
        for (const file of extraFiles) {
            const prevFile = prev.find(f => f.id === file.id)
            if (prevFile && prevFile.code !== file.code) {
                extraEditorsRef.current.get(file.id)?.setValue(file.code)
            }
        }
    }, [extraFiles])

    /* ---------- Cambio codice file extra ---------- */
    const handleExtraChange = useCallback((id: string, value: string, origin: string | undefined) => {
        if (origin === 'setValue') return
        const next = extraFilesRef.current.map(f => f.id === id ? { ...f, code: value } : f)
        onExtraFilesChangeRef.current(next)
    }, [])

    /* ---------- Esecuzione e console ---------- */
    const appendLog = useCallback((type: ConsoleEntry['type'], message: string) => {
        logIdRef.current += 1
        const id = logIdRef.current
        setLogs((current) => [...current, { id, type, message }])
    }, [])

    const run = useCallback((source?: string) => {
        const mainCode = source ?? editorRef.current?.getValue() ?? ''
        const extras: ExtraFile[] = extraFilesRef.current.map(f => ({
            name: f.name,
            code: extraEditorsRef.current.get(f.id)?.getValue() ?? f.code,
        }))
        setSrcDoc(buildPreviewDocument(mainCode, extras))
        setRunId((n) => n + 1)
        logIdRef.current += 1
        setLogs([{ id: logIdRef.current, type: 'log', message: '▶ Esecuzione avviata' }])
        setConsoleVisible(true)
    }, [])

    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            const iframe = iframeRef.current
            if (!iframe || event.source !== iframe.contentWindow || !isPlaygroundMessage(event.data)) return
            const { type, message, line, col } = event.data
            if (type === 'error') {
                const where = line != null ? ` [riga ${line}${col != null ? `, col ${col}` : ''}]` : ''
                appendLog('error', `✖ ${message}${where}`)
            } else {
                appendLog('log', message)
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [appendLog])

    useEffect(() => {
        const box = consoleRef.current
        if (box) box.scrollTop = box.scrollHeight
    }, [logs, consoleVisible])

    function resetCode() {
        if (!window.confirm('Ripristinare il codice di default? Le modifiche correnti andranno perse.')) return
        cancelPendingSave()
        editorRef.current?.setValue(DEFAULT_PLAYGROUND_CODE)
        emit(DEFAULT_PLAYGROUND_CODE)
        run(DEFAULT_PLAYGROUND_CODE)
    }

    /* ---------- Gestione file extra ---------- */
    function addExtraFile() {
        const existing = new Set(extraFiles.map(f => f.name))
        let i = 1
        let name = `module${i}.tsx`
        while (existing.has(name)) { i++; name = `module${i}.tsx` }
        const newFile: PlaygroundExtraFile = { id: createExtraFileId(), name, code: DEFAULT_EXTRA_CODE }
        onExtraFilesChange([...extraFiles, newFile])
        setActiveTabId(newFile.id)
    }

    function renameExtraFile(id: string, newName: string) {
        const trimmed = newName.trim()
        if (!trimmed) return
        const finalName = /\.(tsx?|js)$/.test(trimmed) ? trimmed : trimmed + '.tsx'
        onExtraFilesChange(extraFiles.map(f => f.id === id ? { ...f, name: finalName } : f))
    }

    function deleteExtraFile(id: string) {
        if (!window.confirm('Eliminare questo file?')) return
        extraEditorsRef.current.delete(id)
        onExtraFilesChange(extraFiles.filter(f => f.id !== id))
        setActiveTabId((current) => current === id ? null : current)
    }

    /* ---------- API imperativa ---------- */
    useEffect(() => () => {
        if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    }, [])

    useImperativeHandle(ref, () => ({
        loadCode: (value: string) => {
            cancelPendingSave()
            editorRef.current?.setValue(value)
            emit(value)
            run(value)
            setFlashing(true)
            if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
            flashTimerRef.current = window.setTimeout(() => setFlashing(false), FLASH_MS)
        },
        run: () => run(),
    }), [cancelPendingSave, emit, run])

    /* ---------- Split resizer ---------- */
    function handleSplitPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        setDraggingSplit(true)
    }

    function handleSplitPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const split = splitRef.current
        if (!draggingSplit || !split) return
        const rect = split.getBoundingClientRect()
        const max = rect.height - event.currentTarget.offsetHeight - SPLIT_MIN_HEIGHT
        const next = Math.max(SPLIT_MIN_HEIGHT, Math.min(event.clientY - rect.top, max))
        setEditorHeight(next)
    }

    function stopSplitDrag() {
        if (!draggingSplit) return
        setDraggingSplit(false)
        if (editorHeight !== null) {
            try { localStorage.setItem(LS_PG_SPLIT, String(Math.round(editorHeight))) } catch { /* ignorato */ }
        }
    }

    const panelClassName = ['playground-panel', flashing ? 'flash' : '', className ?? '']
        .filter(Boolean)
        .join(' ')

    return (
        <section className={panelClassName} style={style}>
            <header className="playground-toolbar">
                <button className="pg-btn accent" type="button" onClick={() => run()} title="Esegui (Ctrl+Invio)">
                    <RunIcon /> Run
                </button>
                <button className="pg-btn" type="button" onClick={resetCode}>
                    <ResetIcon /> Reset
                </button>
                <button
                    className={`pg-btn ${consoleVisible ? 'active' : ''}`}
                    type="button"
                    aria-pressed={consoleVisible}
                    onClick={() => setConsoleVisible((v) => !v)}
                >
                    <ConsoleIcon /> Console
                </button>
                <div className="playground-spacer" />
                <span className="pg-autosave">{savedLabel}</span>
            </header>

            <div className="playground-split" ref={splitRef}>
                <div
                    className="playground-editor-wrap"
                    style={editorHeight !== null ? { flex: `0 0 ${editorHeight}px` } : undefined}
                >
                    {/* ---- Tab bar file ---- */}
                    <div className="pg-file-tabs">
                        <button
                            type="button"
                            className={`pg-file-tab ${activeTabId === null ? 'active' : ''}`}
                            onClick={() => setActiveTabId(null)}
                        >
                            App.tsx
                        </button>
                        {extraFiles.map(f => (
                            <PgFileTab
                                key={f.id}
                                file={f}
                                isActive={activeTabId === f.id}
                                onSelect={() => setActiveTabId(f.id)}
                                onRename={(name) => renameExtraFile(f.id, name)}
                                onDelete={() => deleteExtraFile(f.id)}
                            />
                        ))}
                        <button
                            type="button"
                            className="pg-file-tab-add"
                            onClick={addExtraFile}
                            title="Aggiungi nuovo file .tsx"
                        >
                            +
                        </button>
                    </div>

                    {/* ---- Editor App.tsx ---- */}
                    <div style={{ display: activeTabId === null ? 'contents' : 'none' }}>
                        <CodeEditor
                            ref={editorRef}
                            initialValue={code}
                            onChange={handleEditorChange}
                            onRun={() => run()}
                        />
                    </div>

                    {/* ---- Editor file extra (montati sempre, nascosti con display:none) ---- */}
                    {extraFiles.map(f => (
                        <div key={f.id} style={{ display: activeTabId === f.id ? 'contents' : 'none' }}>
                            <ExtraFileEditor
                                file={f}
                                editorMapRef={extraEditorsRef}
                                onChange={handleExtraChange}
                                onRun={() => run()}
                            />
                        </div>
                    ))}
                </div>

                <div
                    className={`playground-split-resizer ${draggingSplit ? 'dragging' : ''}`}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Ridimensiona editor e anteprima"
                    onPointerDown={handleSplitPointerDown}
                    onPointerMove={handleSplitPointerMove}
                    onPointerUp={stopSplitDrag}
                    onPointerCancel={stopSplitDrag}
                    onDoubleClick={() => {
                        setEditorHeight(null)
                        localStorage.removeItem(LS_PG_SPLIT)
                    }}
                />

                <div className="playground-preview-wrap">
                    <span className="panel-label">PREVIEW</span>
                    <iframe
                        key={runId}
                        ref={iframeRef}
                        className="playground-preview"
                        title="Anteprima playground"
                        sandbox="allow-scripts"
                        srcDoc={srcDoc}
                        style={draggingSplit ? { pointerEvents: 'none' } : undefined}
                    />
                </div>
            </div>

            {consoleVisible && (
                <div className="playground-console" ref={consoleRef}>
                    {logs.length === 0 ? (
                        <div className="log-line log-empty">Nessun output. Premi "Run" per eseguire il codice.</div>
                    ) : (
                        logs.map((entry) => (
                            <div key={entry.id} className={`log-line ${entry.type === 'error' ? 'error' : ''}`}>
                                {entry.message}
                            </div>
                        ))
                    )}
                </div>
            )}
        </section>
    )
}

/* ------------------------------------------------------------------ */
/* Componenti ausiliari                                                 */
/* ------------------------------------------------------------------ */

function PgFileTab({
                       file,
                       isActive,
                       onSelect,
                       onRename,
                       onDelete,
                   }: {
    file: PlaygroundExtraFile
    isActive: boolean
    onSelect: () => void
    onRename: (name: string) => void
    onDelete: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(file.name)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (editing) inputRef.current?.select()
    }, [editing])

    function commitRename() {
        setEditing(false)
        onRename(draft)
    }

    return (
        <div className={`pg-file-tab ${isActive ? 'active' : ''}`} role="tab">
            {editing ? (
                <input
                    ref={inputRef}
                    className="pg-file-tab-rename"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') { setEditing(false); setDraft(file.name) }
                    }}
                />
            ) : (
                <span
                    className="pg-file-tab-name"
                    onClick={onSelect}
                    onDoubleClick={() => { setDraft(file.name); setEditing(true) }}
                    title={`${file.name} — doppio clic per rinominare`}
                >
                    {file.name}
                </span>
            )}
            <button
                type="button"
                className="pg-file-tab-close"
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                title="Elimina file"
            >
                ×
            </button>
        </div>
    )
}

function ExtraFileEditor({
                             file,
                             editorMapRef,
                             onChange,
                             onRun,
                         }: {
    file: PlaygroundExtraFile
    editorMapRef: React.RefObject<Map<string, CodeEditorHandle>>
    onChange: (id: string, value: string, origin: string | undefined) => void
    onRun: () => void
}) {
    const editorRef = useRef<CodeEditorHandle>(null)

    useEffect(() => {
        const map = editorMapRef.current
        const handle = editorRef.current
        if (handle) map.set(file.id, handle)
        return () => { map.delete(file.id) }
    }, [file.id, editorMapRef])

    return (
        <CodeEditor
            ref={editorRef}
            initialValue={file.code}
            onChange={(value, origin) => onChange(file.id, value, origin)}
            onRun={onRun}
        />
    )
}