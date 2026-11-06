import {
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type Ref,
} from 'react'
import { EditorState } from '@codemirror/state'
import {
    Decoration,
    EditorView,
    ViewPlugin,
    WidgetType,
    keymap,
    lineNumbers,
    type DecorationSet,
    type ViewUpdate,
} from '@codemirror/view'
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
} from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import {
    acceptCompletion,
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
    completionStatus,
    selectedCompletion,
    type CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete'
import {
    bracketMatching,
    defaultHighlightStyle,
    indentOnInput,
    syntaxHighlighting,
} from '@codemirror/language'
import {
    collectIdentifiers,
    findGhostSuffix,
    PG_BASE_WORDS,
    PG_CONTEXT_WORDS,
} from '../../lib/playgroundHints'
import {
    playgroundDiagnostics,
    setPlaygroundRuntimeErrors,
    type PlaygroundEditorError,
} from '../../lib/playgroundDiagnostics'

export interface CodeEditorHandle {
    getValue: () => string
    /** Sostituisce il contenuto (operazione annullabile con Ctrl+Z). */
    setValue: (value: string) => void
    focus: () => void
    refresh: () => void
    setRuntimeErrors: (errors: readonly PlaygroundEditorError[]) => void
    clearRuntimeErrors: () => void
}

interface CodeEditorProps {
    /** Valore iniziale: dopo il mount usare ref.setValue. */
    initialValue: string
    onChange: (value: string, origin: string | undefined) => void
    onRun?: () => void
    ref?: Ref<CodeEditorHandle>
}

// ---------------------------------------------------------------------------
// Autocompletamento
// ---------------------------------------------------------------------------

function pgCompletionSource(
    context: CompletionContext,
): CompletionResult | null {
    const wordBefore = context.matchBefore(/[A-Za-z_$][\w$]*/)
    const line = context.state.doc.lineAt(context.pos)
    const lineBefore = line.text.slice(0, context.pos - line.from)

    // Completamento membro: document., console.lo, React.use...
    const dotMatch = lineBefore.match(
        /(?:^|[^\w$])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)?$/,
    )

    if (dotMatch) {
        const objectName = dotMatch[1]
        const partial = dotMatch[2] ?? ''
        const members = PG_CONTEXT_WORDS.get(objectName)

        if (members) {
            return {
                from: context.pos - partial.length,
                options: members
                    .filter((member) => member.startsWith(partial))
                    .map((member) => ({
                        label: member,
                        type: 'property',
                    })),
                validFor: /^[\w$]*$/,
            }
        }
    }

    if (!wordBefore || wordBefore.text.length < 1) {
        return null
    }

    const typed = wordBefore.text
    const identifiers = collectIdentifiers(
        context.state.doc.toString(),
    )
    const baseWords = new Set(PG_BASE_WORDS)
    const allWords = [
        ...new Set([...PG_BASE_WORDS, ...identifiers]),
    ]

    const options = allWords
        .filter((word) => word !== typed && word.startsWith(typed))
        .map((word) => ({
            label: word,
            type: baseWords.has(word) ? 'keyword' : 'variable',
        }))

    if (options.length === 0) {
        return null
    }

    return {
        from: wordBefore.from,
        options,
        validFor: /^[\w$]*$/,
    }
}

// ---------------------------------------------------------------------------
// Ghost text
// ---------------------------------------------------------------------------

class GhostWidget extends WidgetType {
    readonly text: string

    constructor(text: string) {
        super()
        this.text = text
    }

    eq(other: GhostWidget): boolean {
        return this.text === other.text
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span')
        span.className = 'pg-ghost-text'
        span.textContent = this.text
        span.setAttribute('aria-hidden', 'true')
        return span
    }

    ignoreEvent(): boolean {
        return true
    }
}

/**
 * Ricava il ghost dal completamento selezionato nel popup.
 * Se il completamento usa una funzione personalizzata (es. uno snippet),
 * non proviamo a rappresentarlo come semplice testo inline.
 */
function suffixFromPopup(
    state: EditorState,
    beforeCursor: string,
): string | null {
    const completion = selectedCompletion(state)

    if (!completion || typeof completion.apply === 'function') {
        return null
    }

    const typed =
        beforeCursor.match(/[A-Za-z_$][\w$]*$/)?.[0] ?? ''

    // Consente il ghost anche subito dopo il punto: document.|
    if (!typed && !beforeCursor.endsWith('.')) {
        return null
    }

    const insertedText =
        typeof completion.apply === 'string'
            ? completion.apply
            : completion.label

    if (!insertedText.startsWith(typed)) {
        return null
    }

    return insertedText.slice(typed.length) || null
}

function makeGhostPlugin() {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet = Decoration.none
            suffix: string | null = null

            update(update: ViewUpdate): void {
                const popupChanged =
                    completionStatus(update.startState) !==
                    completionStatus(update.state) ||
                    selectedCompletion(update.startState) !==
                    selectedCompletion(update.state)

                if (
                    !update.docChanged &&
                    !update.selectionSet &&
                    !popupChanged
                ) {
                    return
                }

                this.suffix = null
                this.decorations = Decoration.none

                const { state } = update
                const selection = state.selection.main

                if (
                    !selection.empty ||
                    state.selection.ranges.length > 1
                ) {
                    return
                }

                const position = selection.head
                const line = state.doc.lineAt(position)
                const offset = position - line.from
                const beforeCursor = line.text.slice(0, offset)
                const afterCursor = line.text.slice(offset)

                // Non inserire suggerimenti in mezzo a una parola.
                if (/^[\w$]/.test(afterCursor)) {
                    return
                }

                const status = completionStatus(state)
                let suffix: string | null = null

                if (status === 'active') {
                    // Nessun fallback locale: il ghost deve seguire il popup.
                    suffix = suffixFromPopup(state, beforeCursor)
                } else if (status === null) {
                    suffix = findGhostSuffix(
                        beforeCursor,
                        collectIdentifiers(state.doc.toString()),
                    )
                }

                // Durante il caricamento del popup nascondiamo il ghost,
                // evitando di mostrare un suggerimento potenzialmente diverso.
                if (!suffix) {
                    return
                }

                this.suffix = suffix
                this.decorations = Decoration.set([
                    Decoration.widget({
                        widget: new GhostWidget(suffix),
                        side: 1,
                    }).range(position),
                ])
            }
        },
        {
            decorations: (plugin) => plugin.decorations,
        },
    )
}

// ---------------------------------------------------------------------------
// Componente React
// ---------------------------------------------------------------------------

export function CodeEditor({
                               initialValue,
                               onChange,
                               onRun,
                               ref,
                           }: CodeEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const initialValueRef = useRef(initialValue)
    const onChangeRef = useRef(onChange)
    const onRunRef = useRef(onRun)
    const programmaticRef = useRef(false)

    useLayoutEffect(() => {
        onChangeRef.current = onChange
        onRunRef.current = onRun
    })

    useEffect(() => {
        const host = hostRef.current

        if (!host) {
            return
        }

        const ghostPlugin = makeGhostPlugin()

        const acceptGhostKeymap = keymap.of([
            {
                key: 'Tab',
                run(view) {
                    if (completionStatus(view.state) === 'active') {
                        // Usa il comando ufficiale per rispettare il range
                        // di sostituzione e le eventuali azioni personalizzate.
                        acceptCompletion(view)

                        // Non inserire il ghost né indentare se il popup
                        // non è ancora pronto ad accettare il completamento.
                        return true
                    }

                    const suffix = view.plugin(ghostPlugin)?.suffix

                    if (!suffix) {
                        // Lascia gestire Tab alla normale indentazione.
                        return false
                    }

                    view.dispatch({
                        ...view.state.replaceSelection(suffix),
                        userEvent: 'input.complete',
                        scrollIntoView: true,
                    })

                    return true
                },
            },
        ])

        // Nessuna associazione personalizzata per ArrowRight:
        // la freccia destra continua a spostare il cursore.
        const runKeymap = keymap.of([
            {
                key: 'Ctrl-Enter',
                run() {
                    onRunRef.current?.()
                    return true
                },
            },
            {
                key: 'Mod-Enter',
                run() {
                    onRunRef.current?.()
                    return true
                },
            },
        ])

        const updateListener = EditorView.updateListener.of(
            (update) => {
                if (!update.docChanged) {
                    return
                }

                const origin = programmaticRef.current
                    ? 'setValue'
                    : undefined

                onChangeRef.current(
                    update.state.doc.toString(),
                    origin,
                )
            },
        )

        const state = EditorState.create({
            doc: initialValueRef.current,
            extensions: [
                oneDark,
                lineNumbers(),
                EditorView.theme({
                    '&': {
                        height: '100%',
                        fontFamily:
                            "'JetBrains Mono', ui-monospace, monospace",
                        fontSize: '12.5px',
                    },
                    '.cm-scroller': {
                        overflow: 'auto',
                        lineHeight: '1.6',
                    },
                    '.cm-content': {
                        padding: '8px 0',
                    },
                    '.cm-line': {
                        padding: '0 8px',
                    },
                    '.cm-gutters': {
                        borderRight: '1px solid #2a323c',
                        background: '#0d1117',
                        color: '#3c4450',
                    },
                    '.cm-activeLineGutter': {
                        background: '#161b22',
                    },
                    '.cm-activeLine': {
                        background: 'rgba(255,255,255,0.03)',
                    },
                    '.cm-selectionBackground': {
                        background: '#264f78 !important',
                    },
                    '&.cm-focused .cm-selectionBackground': {
                        background: '#264f78 !important',
                    },
                    '.cm-tooltip': {
                        background: '#1c2431',
                        border: '1px solid #2a323c',
                        borderRadius: '6px',
                    },
                    '.cm-tooltip-autocomplete > ul': {
                        fontFamily:
                            "'JetBrains Mono', ui-monospace, monospace",
                        fontSize: '12px',
                    },
                    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
                        background: '#7c4fe0',
                        color: '#fff',
                    },
                    '.pg-ghost-text': {
                        color: '#7d8590',
                        opacity: '0.65',
                        pointerEvents: 'none',
                    },
                }),

                javascript({
                    jsx: true,
                    typescript: false,
                }),
                syntaxHighlighting(defaultHighlightStyle, {
                    fallback: true,
                }),
                playgroundDiagnostics(),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),

                history(),
                keymap.of(historyKeymap),

                autocompletion({
                    override: [pgCompletionSource],
                    activateOnTyping: true,
                    maxRenderedOptions: 12,
                    defaultKeymap: false,
                }),

                // Tab viene gestito dalla nostra keymap.
                // Le frecce su/giù ed Enter mantengono il comportamento
                // standard del popup.
                keymap.of(
                    completionKeymap.filter(
                        (binding) => binding.key !== 'Tab',
                    ),
                ),

                ghostPlugin,
                acceptGhostKeymap,

                keymap.of(closeBracketsKeymap),
                keymap.of(defaultKeymap),
                keymap.of([indentWithTab]),
                runKeymap,

                updateListener,
            ],
        })

        const view = new EditorView({
            state,
            parent: host,
        })

        viewRef.current = view

        const resizeObserver = new ResizeObserver(() => {
            view.requestMeasure()
        })

        resizeObserver.observe(host)

        return () => {
            resizeObserver.disconnect()
            view.destroy()
            viewRef.current = null
        }
    }, [])

    useImperativeHandle(
        ref,
        () => ({
            getValue: () =>
                viewRef.current?.state.doc.toString() ?? '',

            setValue: (value) => {
                const view = viewRef.current

                if (!view || view.state.doc.toString() === value) {
                    return
                }

                programmaticRef.current = true

                try {
                    view.dispatch({
                        changes: {
                            from: 0,
                            to: view.state.doc.length,
                            insert: value,
                        },
                    })
                } finally {
                    programmaticRef.current = false
                }
            },

            focus: () => {
                viewRef.current?.focus()
            },

            refresh: () => {
                viewRef.current?.requestMeasure()
            },

            setRuntimeErrors: (errors) => {
                const view = viewRef.current

                if (view) {
                    setPlaygroundRuntimeErrors(view, errors)
                }
            },

            clearRuntimeErrors: () => {
                const view = viewRef.current

                if (view) {
                    setPlaygroundRuntimeErrors(view, [])
                }
            },
        }),
        [],
    )

    return <div ref={hostRef} className="playground-editor-host" />
}