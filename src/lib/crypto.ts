// src/lib/crypto.ts
//
// Cifratura leggera (AES-GCM via Web Crypto API) usata per non salvare in
// localStorage il GitHub Token e il Gist ID in chiaro.
//
// NOTA DI SICUREZZA: trattandosi di un'app puramente client-side, non esiste
// un segreto realmente nascosto all'utente che possiede il browser. Lo scopo
// qui è evitare che il token sia leggibile "a occhio" aprendo i DevTools /
// esportando il localStorage e scoraggiare la copia accidentale. La chiave di
// derivazione è legata all'origin dell'app.

const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()

// Passphrase statica combinata con l'origin: non è un segreto forte, serve solo
// a offuscare i dati a riposo. Può essere sovrascritta via env in build.
const BASE_PASSPHRASE =
    (import.meta.env.VITE_CRYPTO_PASSPHRASE as string | undefined) ??
    'learning-wiki-local-vault'

function getPassphrase(): string {
    const origin =
        typeof window !== 'undefined' ? window.location.origin : 'ssr'
    return `${BASE_PASSPHRASE}::${origin}`
}

const SALT = ENCODER.encode('learning-wiki-static-salt-v1')

async function deriveKey(): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
        'raw',
        ENCODER.encode(getPassphrase()),
        'PBKDF2',
        false,
        ['deriveKey'],
    )

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: SALT,
            iterations: 120_000,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

function toBase64(bytes: Uint8Array): string {
    let binary = ''
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
    })
    return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

const CRYPTO_AVAILABLE =
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function'

export function isCryptoAvailable(): boolean {
    return CRYPTO_AVAILABLE
}

/**
 * Cifra una stringa restituendo una stringa serializzabile ("iv.ciphertext"
 * in base64). Se Web Crypto non è disponibile ricade su un semplice encoding
 * base64 (meglio di niente, ma non cifrato).
 */
export async function encryptString(plaintext: string): Promise<string> {
    if (!plaintext) {
        return ''
    }

    if (!CRYPTO_AVAILABLE) {
        return `plain:${toBase64(ENCODER.encode(plaintext))}`
    }

    const key = await deriveKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        ENCODER.encode(plaintext),
    )

    return `enc:${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`
}

/**
 * Decifra una stringa prodotta da {@link encryptString}. Restituisce stringa
 * vuota se il contenuto non è valido o non decifrabile.
 */
export async function decryptString(payload: string): Promise<string> {
    if (!payload) {
        return ''
    }

    if (payload.startsWith('plain:')) {
        try {
            return DECODER.decode(fromBase64(payload.slice('plain:'.length)))
        } catch {
            return ''
        }
    }

    if (!payload.startsWith('enc:')) {
        // Formato legacy non cifrato: trattalo come testo in chiaro.
        return payload
    }

    if (!CRYPTO_AVAILABLE) {
        return ''
    }

    try {
        const [ivPart, dataPart] = payload.slice('enc:'.length).split('.')
        if (!ivPart || !dataPart) {
            return ''
        }

        const key = await deriveKey()
        const iv = fromBase64(ivPart)
        const data = fromBase64(dataPart)

        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data,
        )

        return DECODER.decode(plaintext)
    } catch {
        return ''
    }
}