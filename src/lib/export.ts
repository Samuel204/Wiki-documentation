import type { WikiFile } from '../types/wiki'

function sanitizeFilename(value: string): string {
    return (
        value
            .replace(/[/\\?%*:|"<>]/g, '-')
            .trim()
            .replace(/\s+/g, '-') || 'file'
    )
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFile(file: WikiFile): void {
    const blob = new Blob([file.content], {
        type: 'text/markdown;charset=utf-8',
    })

    downloadBlob(blob, `${sanitizeFilename(file.title)}.md`)
}

export function exportAllFiles(files: WikiFile[]): void {
    const content = files
        .map((file) => {
            return [
                `# ${file.title}`,
                '',
                `> Categoria: ${file.category}`,
                '',
                file.content,
                '',
                '---',
                '',
            ].join('\n')
        })
        .join('\n')

    const blob = new Blob([content], {
        type: 'text/markdown;charset=utf-8',
    })

    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, `learning-wiki-export-${date}.md`)
}