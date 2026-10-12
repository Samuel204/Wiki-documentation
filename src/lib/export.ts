import type { WikiFile } from '../types/wiki'

// Converte le stringhe in byte UTF-8 (serve per scrivere lo zip).
const ENCODER = new TextEncoder()

/* =====================================================================
 * UTILITY
 * ===================================================================== */

/** Rende un titolo utilizzabile come nome di file/cartella. */
function sanitizeFilename(value: string): string {
    return (
        value
            .replace(/[/\\?%*:|"<>]/g, '-')
            .trim()
            .replace(/\s+/g, '-') || 'file'
    )
}

/** Fa partire il download di un Blob nel browser. */
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

/* =====================================================================
 * EXPORT SINGOLO FILE (invariato)
 * ===================================================================== */

export function exportFile(file: WikiFile): void {
    const blob = new Blob([file.content], {
        type: 'text/markdown;charset=utf-8',
    })

    downloadBlob(blob, `${sanitizeFilename(file.title)}.md`)
}

/* =====================================================================
 * MINI GENERATORE ZIP
 * ---------------------------------------------------------------------
 * Uno zip è fatto così:
 *   [header locale file 1][contenuto file 1]
 *   [header locale file 2][contenuto file 2]
 *   ...
 *   [indice centrale: un record per ogni file]
 *   [record di chiusura: quanti file e dove inizia l'indice]
 *
 * Usiamo il metodo "store" (nessuna compressione): i file .md sono
 * piccoli e così non serve nessuna libreria esterna.
 * ===================================================================== */

/** Tabella precalcolata per il CRC32 (checksum richiesto dal formato zip). */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
        let c = n
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[n] = c >>> 0
    }
    return table
})()

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < data.length; i += 1) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

/** Lo zip salva data/ora nel vecchio formato MS-DOS. */
function dosDateTime(date: Date): { time: number; date: number } {
    return {
        time:
            (date.getHours() << 11) |
            (date.getMinutes() << 5) |
            Math.floor(date.getSeconds() / 2),
        date:
            ((date.getFullYear() - 1980) << 9) |
            ((date.getMonth() + 1) << 5) |
            date.getDate(),
    }
}

interface ZipEntry {
    /** Percorso dentro lo zip, es. "React/useEffect.md" */
    path: string
    content: string
    modified: Date
}

function buildZip(entries: ZipEntry[]): Blob {
    const parts: Uint8Array<ArrayBuffer>[] = []   // header locali + contenuti
    const central: Uint8Array<ArrayBuffer>[] = [] // indice centrale
    let offset = 0                                // posizione corrente nello zip

    for (const entry of entries) {
        const name = ENCODER.encode(entry.path)
        const data = ENCODER.encode(entry.content)
        const crc = crc32(data)
        const { time, date } = dosDateTime(entry.modified)

        // --- Header locale (precede il contenuto del file) ---
        const local = new Uint8Array(30 + name.length)
        const lv = new DataView(local.buffer)
        lv.setUint32(0, 0x04034b50, true) // firma "PK\x03\x04"
        lv.setUint16(4, 20, true)         // versione minima
        lv.setUint16(6, 0x0800, true)     // flag: nomi in UTF-8 (accenti ok)
        lv.setUint16(8, 0, true)          // metodo 0 = nessuna compressione
        lv.setUint16(10, time, true)
        lv.setUint16(12, date, true)
        lv.setUint32(14, crc, true)
        lv.setUint32(18, data.length, true) // dimensione compressa
        lv.setUint32(22, data.length, true) // dimensione originale
        lv.setUint16(26, name.length, true)
        lv.setUint16(28, 0, true)           // nessun campo extra
        local.set(name, 30)

        // --- Record dell'indice centrale (stesse info + offset) ---
        const header = new Uint8Array(46 + name.length)
        const cv = new DataView(header.buffer)
        cv.setUint32(0, 0x02014b50, true) // firma "PK\x01\x02"
        cv.setUint16(4, 20, true)
        cv.setUint16(6, 20, true)
        cv.setUint16(8, 0x0800, true)
        cv.setUint16(10, 0, true)
        cv.setUint16(12, time, true)
        cv.setUint16(14, date, true)
        cv.setUint32(16, crc, true)
        cv.setUint32(20, data.length, true)
        cv.setUint32(24, data.length, true)
        cv.setUint16(28, name.length, true)
        cv.setUint32(42, offset, true)    // dove si trova l'header locale
        header.set(name, 46)

        parts.push(local, data)
        central.push(header)
        offset += local.length + data.length
    }

    // --- Record di chiusura ---
    const centralSize = central.reduce((sum, item) => sum + item.length, 0)
    const end = new Uint8Array(22)
    const ev = new DataView(end.buffer)
    ev.setUint32(0, 0x06054b50, true)       // firma "PK\x05\x06"
    ev.setUint16(8, entries.length, true)   // numero file
    ev.setUint16(10, entries.length, true)
    ev.setUint32(12, centralSize, true)     // dimensione indice
    ev.setUint32(16, offset, true)          // dove inizia l'indice

    return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

/* =====================================================================
 * EXPORT DI TUTTI I FILE
 * ===================================================================== */

/**
 * Esporta TUTTI i file in un unico .zip:
 *   learning-wiki-export-2026-10-12.zip
 *   ├── Generale/
 *   │   ├── Introduzione.md
 *   │   └── Introduzione-2.md   ← titolo duplicato
 *   └── React/
 *       └── useEffect.md
 */
export function exportAllFiles(files: WikiFile[]): void {
    const used = new Set<string>()

    const entries: ZipEntry[] = files.map((file) => {
        const folder = sanitizeFilename(file.category || 'Generale')
        const base = sanitizeFilename(file.title)

        // Evita che due file con lo stesso titolo si sovrascrivano.
        let path = `${folder}/${base}.md`
        for (let i = 2; used.has(path.toLowerCase()); i += 1) {
            path = `${folder}/${base}-${i}.md`
        }
        used.add(path.toLowerCase())

        return {
            path,
            content: file.content ?? '', // contenuto originale, senza aggiunte
            modified: new Date(file.updatedAt || Date.now()),
        }
    })

    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(buildZip(entries), `learning-wiki-export-${date}.zip`)
}