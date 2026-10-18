import { Coordinate, Player } from '../types'

/** A transient visual celebration; the existing heading/live status announces the result. */
export function createBoardWin(board: HTMLElement) {
    let message: HTMLDivElement | undefined, animation: Animation | undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    function clear() {
        animation?.cancel(); animation = undefined
        message?.remove(); message = undefined
    }
    const preferenceChanged = () => { if (reduced.matches) clear() }
    reduced.addEventListener('change', preferenceChanged)
    let width = board.clientWidth
    const resized = new ResizeObserver(() => {
        if (board.clientWidth !== width) { width = board.clientWidth; clear() }
    })
    resized.observe(board)
    return {
        clear,
        show(at: Coordinate, winner: Player) {
            clear()
            const node = document.createElement('div'), side = document.createElement('span'), win = document.createElement('strong')
            node.className = `board-win ${winner}`; node.setAttribute('aria-hidden', 'true')
            node.style.left = `${(at.x + .5) / 11 * 100}%`; node.style.top = `${(at.y + .5) / 11 * 100}%`
            side.className = 'board-win-side'; side.textContent = winner === Player.Attacker ? 'Attacker' : 'Defender'
            win.className = 'board-win-word'; win.textContent = 'WIN'
            node.append(side, win); board.append(node); message = node
            const centered = 'translate(-50%, -50%)'
            const rect = node.getBoundingClientRect(), center = rect.left + rect.width / 2
            const available = Math.max(0, Math.min(center - 2, board.ownerDocument.documentElement.clientWidth - center - 2))
            // Fit the largest animation frame within the viewport without shifting its center.
            const fit = Math.min(1, available / (rect.width / 2 * (reduced.matches ? 1 : 1.2)))
            node.style.transform = `${centered} scale(${fit})`
            animation = node.animate(reduced.matches ? [{ opacity: 1 }, { opacity: 1 }] : [
                { opacity: 0, transform: `${centered} scale(${fit * .65})`, offset: 0, easing: 'ease-out' },
                { opacity: 1, transform: `${centered} scale(${fit})`, offset: .17 },
                { opacity: 1, transform: `${centered} scale(${fit * 1.08})`, offset: .72, easing: 'ease-out' },
                { opacity: 0, transform: `${centered} scale(${fit * 1.2})`, offset: 1 },
            ], { duration: 1800, fill: 'forwards' })
            animation.onfinish = () => { if (message === node) clear() }
        },
        dispose() { clear(); resized.disconnect(); reduced.removeEventListener('change', preferenceChanged) },
    }
}
