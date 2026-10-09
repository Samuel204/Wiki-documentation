// src/components/playground/CodeEditor.tsx
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/material-darker.css'
import 'codemirror/mode/jsx/jsx'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/edit/matchbrackets'
import { collectIdentifiers, findGhostSuffix } from '../../lib/playgroundHints'

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

type Bookmark = ReturnType<CodeMirror.Editor['setBookmark']>

export function CodeEditor({ initialValue, onChange, onRun, ref }: CodeEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<CodeMirror.Editor | null>(null)
    const initialValueRef = useRef(initialValue)
    const onChangeRef = useRef(onChange)
    const onRunRef = useRef(onRun)

    // Callback sempre aggiornate senza ricreare l'editor.
    useLayoutEffect(() => {
        onChangeRef.current = onChange
        onRunRef.current = onRun
    })

    useEffect(() => {
        const host = hostRef.current
        if (!host) {
            return
        }

        /* ---- Ghost text ---- */
        let ghost: { bookmark: Bookmark; suffix: string } | null = null
        let identifiers: string[] | null = null // cache, invalidata a ogni modifica

        const clearGhost = () => {
            ghost?.bookmark.clear()
            ghost = null
        }

        const showGhost = (cm: CodeMirror.Editor) => {
            clearGhost()
            if (cm.somethingSelected()) {
                return
            }

            const cursor = cm.getCursor()
            const line = cm.getLine(cursor.line)

            // Niente suggerimenti a metà parola, nelle stringhe o nei commenti.
            if (/[\w$]/.test(line.charAt(cursor.ch))) {
                return
            }
            const tokenType = cm.getTokenAt(cursor).type ?? ''
            if (/string|comment/.test(tokenType)) {
                return
            }

            identifiers ??= collectIdentifiers(cm.getValue())
            const suffix = findGhostSuffix(line.slice(0, cursor.ch), identifiers)
            if (!suffix) {
                return
            }

            const widget = document.createElement('span')
            widget.className = 'pg-ghost-text'
            widget.textContent = suffix

            ghost = {
                suffix,
                bookmark: cm.setBookmark(cursor, { widget, insertLeft: false }),
            }
        }

        const acceptGhost = (cm: CodeMirror.Editor): boolean => {
            if (!ghost) {
                return false
            }
            const { suffix } = ghost
            clearGhost()
            cm.replaceSelection(suffix)
            return true
        }

        const runCode = () => {
            onRunRef.current?.()
        }

        /* ---- Editor ---- */
        const editor = CodeMirror(host, {
            value: initialValueRef.current,
            mode: 'jsx',
            theme: 'material-darker',
            lineNumbers: true,
            tabSize: 2,
            indentUnit: 2,
            indentWithTabs: false,
            autoCloseBrackets: true,
            matchBrackets: true,
            extraKeys: {
                Tab: (cm) => {
                    if (acceptGhost(cm)) {
                        return
                    }
                    cm.execCommand(cm.somethingSelected() ? 'indentMore' : 'insertSoftTab')
                },
                'Shift-Tab': 'indentLess',
                Right: (cm) => (acceptGhost(cm) ? undefined : CodeMirror.Pass),
                Esc: (cm) => {
                    if (!ghost) {
                        return CodeMirror.Pass
                    }
                    clearGhost()
                    cm.focus()
                },
                'Ctrl-Enter': runCode,
                'Cmd-Enter': runCode,
            },
        })
        editorRef.current = editor

        editor.on('inputRead', (cm, change) => {
            if (/[\w$]$/.test(change.text.join(''))) {
                showGhost(cm)
            } else {
                clearGhost()
            }
        })

        // Se il cursore si sposta dalla posizione del ghost, lo rimuove.
        editor.on('cursorActivity', (cm) => {
            if (!ghost) {
                return
            }
            const pos = ghost.bookmark.find() as CodeMirror.Position | undefined
            const cursor = cm.getCursor()
            if (!pos || pos.line !== cursor.line || pos.ch !== cursor.ch) {
                clearGhost()
            }
        })

        editor.on('blur', clearGhost)

        editor.on('change', (cm, change) => {
            identifiers = null
            onChangeRef.current(cm.getValue(), change.origin)
        })

        // Sostituisce i refresh manuali: si adatta a resizer, mobile e collapse.
        const resizeObserver = new ResizeObserver(() => editor.refresh())
        resizeObserver.observe(host)

        return () => {
            resizeObserver.disconnect()
            clearGhost()
            editor.getWrapperElement().remove()
            editorRef.current = null
        }
    }, [])

    useImperativeHandle(
        ref,
        () => ({
            getValue: () => editorRef.current?.getValue() ?? '',
            setValue: (value) => {
                const editor = editorRef.current
                if (editor && editor.getValue() !== value) {
                    editor.setValue(value)
                }
            },
            focus: () => editorRef.current?.focus(),
            refresh: () => editorRef.current?.refresh(),
        }),
        [],
    )

    return <div ref={hostRef} className="playground-editor-host" />
}