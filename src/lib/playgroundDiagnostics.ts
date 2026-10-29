import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { type EditorView } from '@codemirror/view'
import {
    linter,
    setDiagnostics,
    type Diagnostic,
} from '@codemirror/lint'

export interface PlaygroundEditorError {
    /** Riga e colonna sono entrambe 1-based. */
    line: number
    col?: number | null
    message: string
}

const runtimeErrorsEffect = StateEffect.define<readonly PlaygroundEditorError[]>()

const runtimeErrorsField = StateField.define<readonly PlaygroundEditorError[]>({
    create: () => [],
    update(errors, transaction) {
        let next = transaction.docChanged ? [] : errors

        for (const effect of transaction.effects) {
            if (effect.is(runtimeErrorsEffect)) next = effect.value
        }

        return next
    },
})

function syntaxDiagnostics(view: EditorView): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const { doc } = view.state

    // Concede al parser un piccolo budget per completare anche i file lunghi.
    const tree = ensureSyntaxTree(view.state, doc.length, 30) ?? syntaxTree(view.state)

    tree.iterate({
        enter(node) {
            if (!node.type.isError) return

            const from = Math.min(node.from, doc.length)
            const to = Math.min(Math.max(node.to, from + 1), doc.length)

            diagnostics.push({
                from,
                to,
                severity: 'error',
                source: 'Sintassi',
                message: 'Sintassi non valida o incompleta in questo punto.',
            })
        },
    })

    return diagnostics
}

function runtimeDiagnostics(
    view: EditorView,
    errors: readonly PlaygroundEditorError[],
): Diagnostic[] {
    const { doc } = view.state

    return errors.flatMap((error): Diagnostic[] => {
        // Non attribuire un errore a una riga arbitraria se la posizione non è valida.
        if (!Number.isInteger(error.line) || error.line < 1 || error.line > doc.lines) {
            return []
        }

        const line = doc.line(error.line)
        const offset = error.col == null ? 0 : Math.max(0, error.col - 1)
        const from = Math.min(line.from + offset, line.to)

        return [{
            from,
            to: Math.min(from + 1, line.to),
            severity: 'error',
            source: 'Esecuzione',
            message: error.message,
        }]
    })
}

export function playgroundDiagnostics(): Extension {
    return [
        runtimeErrorsField,
        linter(
            (view) => [
                ...syntaxDiagnostics(view),
                ...runtimeDiagnostics(view, view.state.field(runtimeErrorsField)),
            ],
            {
                delay: 350,
                needsRefresh: (update) => update.transactions.some(
                    (transaction) => transaction.effects.some(
                        (effect) => effect.is(runtimeErrorsEffect),
                    ),
                ),
            },
        ),
    ]
}

export function setPlaygroundRuntimeErrors(
    view: EditorView,
    errors: readonly PlaygroundEditorError[],
): void {
    const diagnostics: Diagnostic[] = [
        ...syntaxDiagnostics(view),
        ...runtimeDiagnostics(view, errors),
    ]

    view.dispatch(
        {
            effects: runtimeErrorsEffect.of(errors),
        },
        setDiagnostics(view.state, diagnostics),
    )
}