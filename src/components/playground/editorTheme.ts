import { EditorView } from '@codemirror/view'

export const editorTheme = EditorView.theme({
    '&': {
        height: '100%',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
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
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
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
})