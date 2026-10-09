// src/components/PanelResizer.tsx
import { useState, type PointerEvent, type RefObject } from 'react'

interface PanelResizerProps {
    containerRef: RefObject<HTMLElement | null>
    minWidth: number
    maxRatio: number
    onResize: (width: number) => void
    onResizeEnd: () => void
    onReset: () => void
}

/** Separatore verticale tra Documentazione e Playground (larghezza del pannello destro). */
export function PanelResizer({ containerRef, minWidth, maxRatio, onResize, onResizeEnd, onReset }: PanelResizerProps) {
    const [dragging, setDragging] = useState(false)

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) {
            return
        }
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        document.body.classList.add('is-resizing')
        setDragging(true)
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        const container = containerRef.current
        if (!dragging || !container) {
            return
        }
        const rect = container.getBoundingClientRect()
        const paddingRight = parseFloat(getComputedStyle(container).paddingRight) || 0
        const max = Math.max(minWidth, rect.width * maxRatio)
        const width = rect.right - paddingRight - event.clientX
        onResize(Math.round(Math.min(max, Math.max(minWidth, width))))
    }

    function stop() {
        if (!dragging) {
            return
        }
        setDragging(false)
        document.body.classList.remove('is-resizing')
        onResizeEnd()
    }

    return (
        <div
            className={`panel-resizer ${dragging ? 'dragging' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Ridimensiona documentazione e playground"
            title="Trascina per ridimensionare · doppio clic per ripristinare"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            onDoubleClick={onReset}
        />
    )
}