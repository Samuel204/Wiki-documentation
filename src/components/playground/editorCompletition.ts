import type { EditorState } from '@codemirror/state'
import type {
    CompletionContext,
    CompletionResult,
} from '@codemirror/autocomplete'
import {
    collectIdentifiers,
    PG_BASE_WORDS,
    PG_CONTEXT_WORDS,
} from '../../lib/playgroundHints'

const identifiersCache = new WeakMap<
    EditorState['doc'],
    readonly string[]
>()

export function getDocumentIdentifiers(state: EditorState): readonly string[] {
    const cached = identifiersCache.get(state.doc)

    if (cached !== undefined) {
        return cached
    }

    const identifiers = collectIdentifiers(state.doc.toString())
    identifiersCache.set(state.doc, identifiers)

    return identifiers
}

export function pgCompletionSource(
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
    const identifiers = getDocumentIdentifiers(context.state)
    const baseWords = new Set(PG_BASE_WORDS)
    const allWords = [...new Set([...PG_BASE_WORDS, ...identifiers])]

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