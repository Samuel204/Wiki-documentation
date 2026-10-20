
import { useEffect, useRef, useState, type RefObject } from 'react'

interface DocumentOutlineProps {
    bodyRef: RefObject<HTMLDivElement | null>
    title: string
    onNavigate: () => void
}

interface OutlineHeading {
    id: string
    title: string
    element: HTMLHeadingElement
}

function FileIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    )
}

// Tempo in cui lo scroll-spy resta sospeso dopo un click sull'indice.
const NAVIGATION_LOCK_MS = 250

export function DocumentOutline({
                                    bodyRef,
                                    title,
                                    onNavigate,
                                }: DocumentOutlineProps) {
    const [headings, setHeadings] = useState<OutlineHeading[]>([])
    const [activeId, setActiveId] = useState('')
    const navigationFrame = useRef<number | null>(null)
    const navigationLockUntil = useRef(0)

    useEffect(() => {
        const body = bodyRef.current
        if (!body) {
            return
        }

        let readFrame = 0
        let activeFrame = 0
        let elements: HTMLHeadingElement[] = []

        function updateActive() {
            activeFrame = 0

            if (!body) {
                return
            }

            // Durante lo scroll avviato da un click non sovrascrivere la scelta.
            if (performance.now() < navigationLockUntil.current) {
                return
            }

            const top = body.getBoundingClientRect().top + 32
            let active = elements[0]

            for (const element of elements) {
                if (element.getBoundingClientRect().top > top) {
                    break
                }
                active = element
            }

            setActiveId(active?.id ?? '')
        }

        function scheduleActive() {
            if (!activeFrame) {
                activeFrame = window.requestAnimationFrame(updateActive)
            }
        }

        // Durante la navigazione rinnova il lock ad ogni frame di scroll.
        function handleScroll() {
            if (performance.now() < navigationLockUntil.current) {
                navigationLockUntil.current = performance.now() + NAVIGATION_LOCK_MS
            }
            scheduleActive()
        }

        function readHeadings() {
            readFrame = 0

            if (!body) {
                return
            }

            const candidates = Array.from(
                body.querySelectorAll<HTMLHeadingElement>(
                    '.document-content h1, .document-content h2',
                ),
            ).filter((element) => !element.closest('pre'))

            // Solo sezioni principali: h2, oppure h1 come fallback.
            const sections = candidates.filter(
                (element) => element.tagName === 'H2',
            )

            elements = sections.length
                ? sections
                : candidates.filter((element) => element.tagName === 'H1')

            const usedIds = new Set(
                Array.from(body.querySelectorAll<HTMLElement>('[id]'))
                    .map((element) => element.id),
            )

            const next = elements.map((element, index): OutlineHeading => {
                if (!element.id) {
                    const base = `wiki-outline-${index + 1}`
                    let id = base
                    let suffix = 2

                    while (usedIds.has(id)) {
                        id = `${base}-${suffix++}`
                    }

                    element.id = id
                    usedIds.add(id)
                }

                return {
                    id: element.id,
                    title: element.textContent?.trim() || 'Sezione senza titolo',
                    element,
                }
            })

            setHeadings(next)
            scheduleActive()
        }

        function scheduleRead() {
            if (!readFrame) {
                readFrame = window.requestAnimationFrame(readHeadings)
            }
        }

        const observer = new MutationObserver(scheduleRead)
        observer.observe(body, {
            childList: true,
            subtree: true,
            characterData: true,
        })

        scheduleRead()
        body.addEventListener('scroll', handleScroll, { passive: true })
        window.addEventListener('resize', scheduleActive)

        return () => {
            observer.disconnect()
            window.cancelAnimationFrame(readFrame)
            window.cancelAnimationFrame(activeFrame)
            body.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', scheduleActive)
        }
    }, [bodyRef])

    useEffect(() => {
        return () => {
            if (navigationFrame.current !== null) {
                window.cancelAnimationFrame(navigationFrame.current)
            }
        }
    }, [])

    function navigate(heading: OutlineHeading) {
        onNavigate()
        setActiveId(heading.id)

        if (navigationFrame.current !== null) {
            window.cancelAnimationFrame(navigationFrame.current)
        }

        // Su mobile attende che il documento torni visibile.
        navigationFrame.current = window.requestAnimationFrame(() => {
            navigationFrame.current = null

            // Imposta il lock qui, fuori dal render path.
            navigationLockUntil.current = performance.now() + NAVIGATION_LOCK_MS

            const body = bodyRef.current

            if (!body || !body.contains(heading.element)) {
                return
            }

            const top =
                body.scrollTop +
                heading.element.getBoundingClientRect().top -
                body.getBoundingClientRect().top -
                24

            body.scrollTo({
                top: Math.max(0, top),
                behavior: window.matchMedia(
                    '(prefers-reduced-motion: reduce)',
                ).matches
                    ? 'instant'
                    : 'smooth',
            })

            heading.element.setAttribute('tabindex', '-1')
            heading.element.focus({ preventScroll: true })
        })
    }

    return (
        <nav className="document-outline" aria-label="Indice del documento">
            <div className="outline-document" title={title}>
                <FileIcon />
                <span>{title}</span>
            </div>

            {headings.length ? (
                <ul className="outline-branches">
                    {headings.map((heading) => (
                        <li className="outline-node" key={heading.id}>
                            <div
                                className={`outline-row ${
                                    activeId === heading.id ? 'active' : ''
                                }`}
                            >
                                <button
                                    className="outline-link"
                                    type="button"
                                    aria-current={
                                        activeId === heading.id
                                            ? 'location'
                                            : undefined
                                    }
                                    onClick={() => navigate(heading)}
                                >
                                    <span>{heading.title}</span>
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="sidebar-empty">
                    Nessun titolo principale disponibile nell'anteprima.
                </p>
            )}
        </nav>
    )
}