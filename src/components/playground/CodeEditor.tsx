
// src/components/playground/CodeEditor.tsx
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import {
    autocompletion,
    completionKeymap,
    closeBrackets,
    closeBracketsKeymap,
    type CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete'
import {
    bracketMatching,
    indentOnInput,
    syntaxHighlighting,
    defaultHighlightStyle,
} from '@codemirror/language'
import { ViewPlugin, Decoration, type DecorationSet, WidgetType, type ViewUpdate } from '@codemirror/view'
import { collectIdentifiers, findGhostSuffix, PG_BASE_WORDS, PG_CONTEXT_WORDS } from '../../lib/playgroundHints'

export interface CodeEditorHandle {
    getValue: () => string
    /** Sostituisce il contenuto (operazione annullabile con Ctrl+Z). */
    setValue: (value: string) => void
    focus: () => void
    refresh: () => void
}

interface CodeEditorProps {
    /** Valore iniziale: dopo il mount usare `ref.setValue`. */
    initialValue: string
    onChange: (value: string, origin: string | undefined) => void
    onRun?: () => void
    ref?: Ref<CodeEditorHandle>
}

// ---------------------------------------------------------------------------
// Completion source per il Playground (integra playgroundHints con CM6)
// ---------------------------------------------------------------------------
function makePgCompletionSource(getDoc: () => string) {
    return function pgComplete(ctx: CompletionContext): CompletionResult | null {
        const wordBefore = ctx.matchBefore(/[A-Za-z_$][\w$]*/)
        const line = ctx.state.doc.lineAt(ctx.pos)
        const lineBefore = line.text.slice(0, ctx.pos - line.from)

        // Completamento membro: `oggetto.parziale`
        const dotMatch = lineBefore.match(/(?:^|[^\w$])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)?$/)
        if (dotMatch) {
            const obj = dotMatch[1]
            const partial = dotMatch[2] ?? ''
            const members = PG_CONTEXT_WORDS.get(obj)
            if (members) {
                return {
                    from: ctx.pos - partial.length,
                    options: members
                        .filter(m => m.startsWith(partial))
                        .map(m => ({ label: m, type: 'property' as const })),
                    validFor: /^[\w$]*$/,
                }
            }
        }

        // Completamento parole base + identificatori documento
        if (!wordBefore || wordBefore.text.length < 1) return null
        const typed = wordBefore.text

        const docIdentifiers = collectIdentifiers(getDoc())
        const baseSet = new Set(PG_BASE_WORDS)
        const allWords = [...new Set([...PG_BASE_WORDS, ...docIdentifiers])]

        const options = allWords
            .filter(w => w !== typed && w.startsWith(typed))
            .map(w => ({
                label: w,
                type: (baseSet.has(w) ? 'keyword' : 'variable') as 'keyword' | 'variable',
            }))

        if (options.length === 0) return null

        return {
            from: wordBefore.from,
            options,
            validFor: /^[\w$]*$/,
        }
    }
}

// ---------------------------------------------------------------------------
// Ghost text inline via widget decoration CM6
// ---------------------------------------------------------------------------
class GhostWidget extends WidgetType {
    readonly text: string
    constructor(text: string) { super(); this.text = text }
    eq(other: GhostWidget) { return this.text === other.text }
    toDOM() {
        const span = document.createElement('span')
        span.className = 'pg-ghost-text'
        span.textContent = this.text
        return span
    }
    ignoreEvent() { return true }
}

function makeGhostPlugin(getDoc: () => string) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet = Decoration.none
            suffix: string | null = null

            update(update: ViewUpdate) {
                const sel = update.state.selection.main

                // Rimuovi ghost se c'è selezione o cursori multipli
                if (!sel.empty || update.state.selection.ranges.length > 1) {
                    this.suffix = null
                    this.decorations = Decoration.none
                    return
                }

                // Aggiorna solo se doc o cursore sono cambiati
                if (!update.docChanged && !update.selectionSet) return

                const pos = sel.head
                const line = update.state.doc.lineAt(pos)
                const beforeCursor = line.text.slice(0, pos - line.from)
                const afterCursor = line.text.slice(pos - line.from)

                // Niente ghost a metà parola
                if (/^[\w$]/.test(afterCursor)) {
                    this.suffix = null
                    this.decorations = Decoration.none
                    return
                }

                const identifiers = collectIdentifiers(getDoc())
                const newSuffix = findGhostSuffix(beforeCursor, identifiers)

                if (!newSuffix) {
                    this.suffix = null
                    this.decorations = Decoration.none
                    return
                }

                this.suffix = newSuffix
                this.decorations = Decoration.set([
                    Decoration.widget({
                        widget: new GhostWidget(newSuffix),
                        side: 1,
                    }).range(pos),
                ])
            }
        },
        { decorations: v => v.decorations },
    )
}

// ---------------------------------------------------------------------------
// Componente React
// ---------------------------------------------------------------------------
export function CodeEditor({ initialValue, onChange, onRun, ref }: CodeEditorProps) {
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
        if (!host) return

        const getDoc = () => viewRef.current?.state.doc.toString() ?? ''

        const ghostPlugin = makeGhostPlugin(getDoc)

        // Keybinding: Tab / ArrowRight accettano il ghost
        const acceptGhostKeymap = keymap.of([
            {
                key: 'Tab',
                run(view) {
                    const plugin = view.plugin(ghostPlugin)
                    if (!plugin?.suffix) return false
                    const suffix = plugin.suffix
                    view.dispatch(view.state.replaceSelection(suffix))
                    return true
                },
            },
            {
                key: 'ArrowRight',
                run(view) {
                    const plugin = view.plugin(ghostPlugin)
                    if (!plugin?.suffix) return false
                    const suffix = plugin.suffix
                    view.dispatch(view.state.replaceSelection(suffix))
                    return true
                },
            },
        ])

        const runKeymap = keymap.of([
            {
                key: 'Ctrl-Enter',
                run() { onRunRef.current?.(); return true },
            },
            {
                key: 'Mod-Enter',
                run() { onRunRef.current?.(); return true },
            },
        ])

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const origin = programmaticRef.current ? 'setValue' : undefined
                onChangeRef.current(update.state.doc.toString(), origin)
            }
        })

        const state = EditorState.create({
            doc: initialValueRef.current,
            extensions: [
                oneDark,
                lineNumbers(),
                EditorView.theme({
                    '&': { height: '100%', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '12.5px' },
                    '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
                    '.cm-content': { padding: '8px 0' },
                    '.cm-line': { padding: '0 8px' },
                    '.cm-gutters': { borderRight: '1px solid #2a323c', background: '#0d1117', color: '#3c4450' },
                    '.cm-activeLineGutter': { background: '#161b22' },
                    '.cm-activeLine': { background: 'rgba(255,255,255,0.03)' },
                    '.cm-selectionBackground': { background: '#264f78 !important' },
                    '&.cm-focused .cm-selectionBackground': { background: '#264f78 !important' },
                    '.cm-tooltip': { background: '#1c2431', border: '1px solid #2a323c', borderRadius: '6px' },
                    '.cm-tooltip-autocomplete > ul': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '12px' },
                    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: '#7c4fe0', color: '#fff' },
                }),

                javascript({ jsx: true, typescript: false }),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),

                history(),
                keymap.of([...historyKeymap]),

                // Autocompletamento: rimuoviamo Tab dai completionKeymap per non
                // interferire con il ghost text
                autocompletion({
                    override: [makePgCompletionSource(getDoc)],
                    activateOnTyping: true,
                    maxRenderedOptions: 12,
                    defaultKeymap: false,
                }),
                keymap.of(completionKeymap.filter(b => b.key !== 'Tab')),

                // Ghost text inline
                ghostPlugin,
                acceptGhostKeymap,

                // Backspace tra una coppia vuota (es. "(|)") cancella entrambe le parentesi
                keymap.of(closeBracketsKeymap),

                // Keybinding standard
                keymap.of(defaultKeymap),
                keymap.of([indentWithTab]),
                runKeymap,

                updateListener,
            ],
        })

        const view = new EditorView({ state, parent: host })
        viewRef.current = view

        const resizeObserver = new ResizeObserver(() => view.requestMeasure())
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
            getValue: () => viewRef.current?.state.doc.toString() ?? '',
            setValue: (value) => {
                const view = viewRef.current
                if (!view) return
                if (view.state.doc.toString() === value) return
                programmaticRef.current = true
                view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: value },
                })
                programmaticRef.current = false
            },
            focus: () => viewRef.current?.focus(),
            refresh: () => viewRef.current?.requestMeasure(),
        }),
        [],
    )

    return <div ref={hostRef} className="playground-editor-host" />
}