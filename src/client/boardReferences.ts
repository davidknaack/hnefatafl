import { BoardReference } from '../moveComments'

/** Independent annotation layer: no engine commands, selection or move effects. */
export function createBoardReferences(board: HTMLElement) {
    let overlay: SVGSVGElement | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => { clearTimeout(timer); timer = undefined; overlay?.remove(); overlay = undefined }
    return {
        clear,
        show(reference?: BoardReference, temporary = false) {
            clear()
            if (!reference) return
            const element = (name: string, attributes: Record<string, string>) => {
                const node = document.createElementNS('http://www.w3.org/2000/svg', name)
                Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value))
                return node
            }
            overlay = element('svg', { viewBox: '0 0 1100 1100', class: 'comment-board-reference', 'aria-hidden': 'true' }) as SVGSVGElement
            const { from, to } = reference
            if (!to) overlay.append(element('rect', { x: String(from.x * 100 + 8), y: String(from.y * 100 + 8), width: '84', height: '84', rx: '15', class: 'comment-square-reference' }))
            else {
                const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy)
                const sx = dx / distance, sy = dy / distance
                const x = from.x * 100 + 50, y = from.y * 100 + 50
                const tx = to.x * 100 + 50 - sx * 14, ty = to.y * 100 + 50 - sy * 14
                overlay.append(element('path', { class: 'comment-move-reference',
                    d: `M ${x} ${y} L ${tx} ${ty} M ${tx - sx * 24 - sy * 17} ${ty - sy * 24 + sx * 17} L ${tx} ${ty} L ${tx - sx * 24 + sy * 17} ${ty - sy * 24 - sx * 17}` }))
            }
            board.append(overlay)
            if (temporary) {
                // On a narrow layout the record is below the board. Bring a tapped
                // reference into view without changing focus, selection or review position.
                const bounds = board.getBoundingClientRect()
                if (bounds.top < 0 || bounds.bottom > window.innerHeight) board.scrollIntoView({
                    block: 'center', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
                })
                timer = setTimeout(clear, 1800)
            }
        },
        dispose: clear,
    }
}
