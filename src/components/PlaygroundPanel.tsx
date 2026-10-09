
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
import { buildPreviewDocument, isPlaygroundMessage } from '../lib/playgroundPreview'

const SAVE_DEBOUNCE_MS = 900
const FLASH_MS = 700
const SPLIT_MIN_HEIGHT = 110
const LS_PG_SPLIT = 'lw_pg_split_v1'

export interface PlaygroundPanelHandle {
    /** Carica un esempio, lo esegue ed evidenzia il pannello. */
    loadCode: (code: string) => void
    run: () => void
}

interface PlaygroundPanelProps {
    code: string
    onChange: (code: string) => void
    className?: string
    style?: CSSProperties
    ref?: Ref<PlaygroundPanelHandle>
}

interface ConsoleEntry {
    id: number
    type: 'log' | 'error'
    message: string
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

export function PlaygroundPanel({ code, onChange, className, style, ref }: PlaygroundPanelProps) {
    const [srcDoc, setSrcDoc] = useState(() => buildPreviewDocument(code))
    const [runId, setRunId] = useState(0)
    const [consoleVisible, setConsoleVisible] = useState(false)
    const [logs, setLogs] = useState<ConsoleEntry[]>([])
    const [savedLabel, setSavedLabel] = useState('—')
    const [flashing, setFlashing] = useState(false)
    const [editorHeight, setEditorHeight] = useState<number | null>(loadSplitHeight)
    const [draggingSplit, setDraggingSplit] = useState(false)

    const editorRef = useRef<CodeEditorHandle>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const splitRef = useRef<HTMLDivElement>(null)
    const consoleRef = useRef<HTMLDivElement>(null)
    const logIdRef = useRef(0)
    const onChangeRef = useRef(onChange)
    const lastEmittedRef = useRef(code)
    const pendingCodeRef = useRef<string | null>(null)
    const saveTimerRef = useRef<number | null>(null)
    const flashTimerRef = useRef<number | null>(null)

    useLayoutEffect(() => {
        onChangeRef.current = onChange
    })

    /* ---------- Salvataggio con debounce ---------- */
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
        if (pending !== null) {
            emit(pending)
        }
    }, [cancelPendingSave, emit])

    const handleEditorChange = useCallback(
        (value: string, origin: string | undefined) => {
            // Le sostituzioni programmatiche vengono già gestite da chi le esegue.
            if (origin === 'setValue') {
                return
            }
            pendingCodeRef.current = value
            setSavedLabel('modifiche non salvate...')
            if (saveTimerRef.current !== null) {
                window.clearTimeout(saveTimerRef.current)
            }
            saveTimerRef.current = window.setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS)
        },
        [flushPendingSave],
    )

    // Non perde modifiche alla chiusura della pagina o allo smontaggio.
    useEffect(() => {
        window.addEventListener('pagehide', flushPendingSave)
        return () => {
            window.removeEventListener('pagehide', flushPendingSave)
            flushPendingSave()
        }
    }, [flushPendingSave])

    // Codice cambiato dall'esterno (es. pull dal Gist) → aggiorna l'editor.
    useEffect(() => {
        if (code === lastEmittedRef.current) {
            return
        }
        lastEmittedRef.current = code
        cancelPendingSave()
        editorRef.current?.setValue(code)
    }, [code, cancelPendingSave])

    /* ---------- Esecuzione e console ---------- */
    const appendLog = useCallback((type: ConsoleEntry['type'], message: string) => {
        logIdRef.current += 1
        const id = logIdRef.current
        setLogs((current) => [...current, { id, type, message }])
    }, [])

    const run = useCallback(
        (source?: string) => {
            const value = source ?? editorRef.current?.getValue() ?? ''
            setSrcDoc(buildPreviewDocument(value))
            setRunId((n) => n + 1) // forza il reload anche con codice identico
            logIdRef.current += 1
            setLogs([{ id: logIdRef.current, type: 'log', message: '▶ Esecuzione avviata' }])
            setConsoleVisible(true)
        },
        [],
    )

    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            const iframe = iframeRef.current
            if (!iframe || event.source !== iframe.contentWindow || !isPlaygroundMessage(event.data)) {
                return
            }
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

    // Autoscroll della console.
    useEffect(() => {
        const box = consoleRef.current
        if (box) {
            box.scrollTop = box.scrollHeight
        }
    }, [logs, consoleVisible])

    function resetCode() {
        if (!window.confirm('Ripristinare il codice di default? Le modifiche correnti andranno perse.')) {
            return
        }
        cancelPendingSave()
        editorRef.current?.setValue(DEFAULT_PLAYGROUND_CODE)
        emit(DEFAULT_PLAYGROUND_CODE)
        run(DEFAULT_PLAYGROUND_CODE)
    }

    /* ---------- API imperativa (Apri nel Playground) ---------- */
    useEffect(
        () => () => {
            if (flashTimerRef.current !== null) {
                window.clearTimeout(flashTimerRef.current)
            }
        },
        [],
    )

    useImperativeHandle(
        ref,
        () => ({
            loadCode: (value: string) => {
                cancelPendingSave()
                editorRef.current?.setValue(value)
                emit(value)
                run(value)
                setFlashing(true)
                if (flashTimerRef.current !== null) {
                    window.clearTimeout(flashTimerRef.current)
                }
                flashTimerRef.current = window.setTimeout(() => setFlashing(false), FLASH_MS)
            },
            run: () => run(),
        }),
        [cancelPendingSave, emit, run],
    )

    /* ---------- Split resizer editor / preview ---------- */
    function handleSplitPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        setDraggingSplit(true)
    }

    function handleSplitPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const split = splitRef.current
        if (!draggingSplit || !split) {
            return
        }
        const rect = split.getBoundingClientRect()
        const max = rect.height - event.currentTarget.offsetHeight - SPLIT_MIN_HEIGHT
        const next = Math.max(SPLIT_MIN_HEIGHT, Math.min(event.clientY - rect.top, max))
        setEditorHeight(next)
    }

    function stopSplitDrag() {
        if (!draggingSplit) {
            return
        }
        setDraggingSplit(false)
        if (editorHeight !== null) {
            try {
                localStorage.setItem(LS_PG_SPLIT, String(Math.round(editorHeight)))
            } catch {
                // localStorage non disponibile: il layout resta solo in memoria.
            }
        }
    }

    const panelClassName = ['playground-panel', flashing ? 'flash' : '', className ?? '']
        .filter(Boolean)
        .join(' ')

    return (
        <section className={panelClassName} style={style}>
            <header className="playground-toolbar">
                <button className="pg-btn accent" type="button" onClick={() => run()} title="Esegui (Ctrl+Invio)">
                    <RunIcon />
                    Run
                </button>

                <button className="pg-btn" type="button" onClick={resetCode}>
                    <ResetIcon />
                    Reset
                </button>

                <button
                    className={`pg-btn ${consoleVisible ? 'active' : ''}`}
                    type="button"
                    aria-pressed={consoleVisible}
                    onClick={() => setConsoleVisible((value) => !value)}
                >
                    <ConsoleIcon />
                    Console
                </button>

                <div className="playground-spacer" />

                <span className="pg-autosave">{savedLabel}</span>
            </header>

            <div className="playground-split" ref={splitRef}>
                <div
                    className="playground-editor-wrap"
                    style={editorHeight !== null ? { flex: `0 0 ${editorHeight}px` } : undefined}
                >
                    <span className="panel-label">EDITOR</span>
                    <CodeEditor
                        ref={editorRef}
                        initialValue={code}
                        onChange={handleEditorChange}
                        onRun={() => run()}
                    />
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
                        <div className="log-line log-empty">
                            Nessun output. Premi “Run” per eseguire il codice.
                        </div>
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