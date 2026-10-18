import { Coordinate, PieceType } from '../types'

const SVG = 'http://www.w3.org/2000/svg'
const SLIDE_MS = 420, FADE_MS = 180
let indicatorId = 0
export interface CapturedPiece { at: Coordinate; type: PieceType }

/** Presentation only: the engine position is committed before any animation starts. */
export function createBoardMotion(board: HTMLElement, square: (coord: Coordinate) => HTMLButtonElement) {
    let slide: Animation | undefined, fade: Animation | undefined
    let movingSquare: HTMLButtonElement | undefined, overlay: SVGSVGElement | undefined
    let captures: { piece: HTMLElement; animation?: Animation }[] = []
    let fading = false
    let onArrival: (() => void) | undefined
    let frame = 0, finishArrow: (() => void) | undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    function stopSlide() {
        cancelAnimationFrame(frame); frame = 0
        slide?.cancel(); slide = undefined
        movingSquare?.classList.remove('piece-in-motion'); movingSquare = undefined
        finishArrow?.(); finishArrow = undefined
    }
    function clearCaptures() {
        captures.forEach(({ piece, animation }) => { animation?.cancel(); piece.remove() })
        captures = []
    }
    function arrive() { const callback = onArrival; onArrival = undefined; callback?.() }
    function snap() { stopSlide(); arrive(); fadeMove() }
    function fadeMove() {
        const svg = overlay
        if (!svg || fading) return
        if (reduced.matches) { clear(); return }
        fading = true; fade?.cancel()
        const frames = [{ opacity: 1 }, { opacity: 0 }]
        const options: KeyframeAnimationOptions = { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' }
        const start = document.timeline.currentTime
        fade = svg.animate(frames, options)
        fade.startTime = start
        captures.forEach(capture => {
            const animation = capture.piece.animate(frames, options)
            animation.startTime = start
            capture.animation = animation
        })
        fade.onfinish = () => { if (overlay === svg) clear() }
    }
    function clear() {
        stopSlide(); onArrival = undefined; clearCaptures(); fade?.cancel(); fade = undefined; fading = false
        overlay?.remove(); overlay = undefined
    }
    let width = board.clientWidth
    const resized = new ResizeObserver(() => {
        if (board.clientWidth !== width) { width = board.clientWidth; snap() }
    })
    resized.observe(board)
    const preferenceChanged = () => { if (reduced.matches) clear() }
    reduced.addEventListener('change', preferenceChanged)
    function show(from: Coordinate, to: Coordinate, type?: PieceType, animate = false, captured: CapturedPiece[] = [], arrived?: () => void) {
        clear()
        onArrival = arrived
        const element = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string> = {}) => {
            const node = document.createElementNS(SVG, name)
            Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value))
            return node
        }
        const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy)
        if (!distance) { arrive(); return }
        const sx = dx / distance, sy = dy / distance
        // The tail overlaps the ghost; the tip stops just inside the destination edge.
        const length = distance * 100 - 70
        const id = `move-gradient-${++indicatorId}`
        const svg = element('svg', { viewBox: '0 0 1100 1100', 'aria-hidden': 'true', focusable: 'false', class: 'move-indicator',
            'data-from': `${from.x},${from.y}`, 'data-to': `${to.x},${to.y}` })
        const defs = element('defs'), gradient = element('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: '0', y1: '0', x2: String(length), y2: '0' })
        gradient.append(element('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '.08' }),
            element('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '.95' }))
        defs.append(gradient)
        const origin = element('foreignObject', { x: String(from.x * 100 + 15), y: String(from.y * 100 + 15), width: '70', height: '70', class: 'move-origin' })
        if (type) {
            const ghost = document.createElement('div')
            ghost.className = `piece ${type} move-ghost`; ghost.textContent = type === PieceType.King ? '♔' : ''
            origin.append(ghost)
        }
        const arrow = element('g', { transform: `translate(${from.x * 100 + 50 + sx * 28} ${from.y * 100 + 50 + sy * 28}) rotate(${Math.atan2(dy, dx) * 180 / Math.PI})`, fill: `url(#${id})`, class: 'move-arrow' })
        const stem = element('rect', { x: '0', y: '-3', height: '6', rx: '3' })
        const head = element('path', { d: 'M0 0 -16 -9 -16 9Z', fill: 'currentColor', 'fill-opacity': '.95', class: 'move-arrow-head' })
        arrow.append(stem, head); svg.append(defs, origin, arrow); board.append(svg); overlay = svg
        const grow = (progress: number) => {
            const tip = length * progress
            stem.setAttribute('width', String(Math.max(0, tip - 16)))
            head.setAttribute('transform', `translate(${tip} 0)`)
            arrow.setAttribute('opacity', String(Math.min(1, tip / 16)))
        }
        grow(1)
        if (type && animate && !reduced.matches) {
            captures = captured.map(({ at, type }) => {
                const target = square(at), piece = document.createElement('span')
                piece.className = `piece ${type} capture-piece`; piece.textContent = type === PieceType.King ? '♔' : ''
                piece.setAttribute('aria-hidden', 'true')
                target.insertBefore(piece, target.lastElementChild)
                return { piece }
            })
            const target = square(to), sourceRect = square(from).getBoundingClientRect(), targetRect = target.getBoundingClientRect()
            const piece = target.querySelector<HTMLElement>('.piece')!
            movingSquare = target; target.classList.add('piece-in-motion')
            slide = piece.animate([
                { transform: `translate(${sourceRect.left - targetRect.left}px, ${sourceRect.top - targetRect.top}px)` },
                { transform: 'translate(0, 0)' },
            ], { duration: SLIDE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
            const animation = slide
            finishArrow = () => grow(1)
            grow(0)
            const tick = () => {
                if (slide !== animation) return
                grow(animation.effect?.getComputedTiming().progress ?? 0)
                frame = requestAnimationFrame(tick)
            }
            frame = requestAnimationFrame(tick)
            animation.onfinish = () => { if (slide === animation) { stopSlide(); arrive(); fadeMove() } }
        }
        fade = svg.animate(reduced.matches ? [{ opacity: 1 }, { opacity: 1 }] : [
            { opacity: 0, offset: 0, easing: 'ease-out' },
            { opacity: 1, offset: 110 / SLIDE_MS },
            { opacity: 1, offset: 1 },
        ], { duration: SLIDE_MS, fill: 'forwards' })
        fade.onfinish = () => {
            if (overlay !== svg) return
            if (reduced.matches) clear()
            else if (!slide) fadeMove()
        }
        if (!slide) arrive()
    }
    return {
        show, snap, clear,
        dispose() { clear(); resized.disconnect(); reduced.removeEventListener('change', preferenceChanged) },
    }
}
