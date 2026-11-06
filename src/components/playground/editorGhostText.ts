import type { EditorState, Extension } from '@codemirror/state'
import {
    Decoration,
    ViewPlugin,
    WidgetType,
    keymap,
    type DecorationSet,
    type ViewUpdate,
} from '@codemirror/view'
import {
    acceptCompletion,
    completionStatus,
    selectedCompletion,
} from '@codemirror/autocomplete'
import { findGhostSuffix } from '../../lib/playgroundHints'
import { getDocumentIdentifiers } from './editorCompletition'

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

function suffixFromPopup(
    state: EditorState,
    beforeCursor: string,
): string | null {
    const completion = selectedCompletion(state)

    if (!completion || typeof completion.apply === 'function') {
        return null
    }

    const typed = beforeCursor.match(/[A-Za-z_$][\w$]*$/)?.[0] ?? ''

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
                    // Il ghost segue il suggerimento selezionato nel popup.
                    suffix = suffixFromPopup(state, beforeCursor)
                } else if (status === null) {
                    suffix = findGhostSuffix(
                        beforeCursor,
                        getDocumentIdentifiers(state),
                    )
                }

                // Durante il caricamento del popup il ghost resta nascosto.
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

export function createGhostText(): Extension {
    const ghostPlugin = makeGhostPlugin()

    const acceptGhostKeymap = keymap.of([
        {
            key: 'Tab',
            run(view) {
                if (completionStatus(view.state) === 'active') {
                    // Rispetta range di sostituzione e azioni personalizzate.
                    acceptCompletion(view)

                    // Non indentare se il popup non è ancora pronto.
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

    return [ghostPlugin, acceptGhostKeymap]
}