import {
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type Ref,
} from 'react'
import { EditorState } from '@codemirror/state'
import {
    EditorView,
    keymap,
    lineNumbers,
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
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
} from '@codemirror/autocomplete'
import {
    bracketMatching,
    defaultHighlightStyle,
    indentOnInput,
    syntaxHighlighting,
} from '@codemirror/language'
import {
    playgroundDiagnostics,
    setPlaygroundRuntimeErrors,
    type PlaygroundEditorError,
} from '../../lib/playgroundDiagnostics'
import { pgCompletionSource } from './editorCompletition'
import { createGhostText } from './editorGhostText'
import { editorTheme } from './editorTheme'

export interface CodeEditorHandle {
    getValue: () => string
    setValue: (value: string) => void
    focus: () => void
    refresh: () => void
    setRuntimeErrors: (errors: readonly PlaygroundEditorError[]) => void
    clearRuntimeErrors: () => void
}

interface CodeEditorProps {
    initialValue: string
    onChange: (value: string, origin: string | undefined) => void
    onRun?: () => void
    ref?: Ref<CodeEditorHandle>
}

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

        const ghostText = createGhostText()

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
                editorTheme,

                javascript({
                    jsx: true,
                    typescript: true,
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

                // Tab è gestito dall'estensione ghost text.
                // Frecce ed Enter mantengono il comportamento standard.
                keymap.of(
                    completionKeymap.filter(
                        (binding) => binding.key !== 'Tab',
                    ),
                ),

                ghostText,

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