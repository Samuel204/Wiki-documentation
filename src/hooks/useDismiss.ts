import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/** Chiude un popover con clic esterno o Esc. */
export function useDismiss(
    ref: RefObject<HTMLElement | null>,
    active: boolean,
    onDismiss: () => void,
) {
    const callbackRef = useRef(onDismiss)

    useLayoutEffect(() => {
        callbackRef.current = onDismiss
    })

    useEffect(() => {
        if (!active) {
            return
        }

        function handlePointerDown(event: PointerEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callbackRef.current()
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                callbackRef.current()
            }
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [active, ref])
}