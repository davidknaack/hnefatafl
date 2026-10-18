import { coordToString } from '../coordinates'
import { BoardReference, commentParts, MAX_COMMENT_LENGTH } from '../moveComments'
import { GameSession } from '../session/GameSession'
import { ClientElements } from './elements'

/** Current identity is supplied by the consumer; local games have no named author. */
export function bindComments(ui: ClientElements, session: GameSession,
    reference: (value?: BoardReference, temporary?: boolean) => void, author: () => string | undefined) {
    let view = session.getView(), position = '', signature = '', active = true
    const count = () => Array.from(ui.commentText.value).length
    function entry() {
        const length = count()
        ui.commentCount.textContent = `${length} / ${MAX_COMMENT_LENGTH}`
        ui.commentAdd.disabled = ui.commentText.disabled || !ui.commentText.value.trim() || length > MAX_COMMENT_LENGTH
        ui.commentText.setAttribute('aria-invalid', String(length > MAX_COMMENT_LENGTH))
    }
    ui.commentText.oninput = () => { ui.commentStatus.textContent = ''; entry() }
    ui.commentForm.onsubmit = event => {
        event.preventDefault()
        if (!active || ui.commentAdd.disabled) return
        try {
            const result = session.addComment?.(ui.commentText.value, author(), view.generation)
            if (!result?.success) { ui.commentStatus.textContent = result?.error ?? 'Comments are not available'; return }
            ui.commentText.value = ''; entry(); ui.commentStatus.textContent = 'Comment added.'
            ui.commentText.focus(); ui.commentList.scrollTop = ui.commentList.scrollHeight
        } catch (error) { ui.commentStatus.textContent = error instanceof Error ? error.message : 'Could not add comment' }
    }
    const unsubscribe = session.subscribe(next => {
        if (!active) return
        view = next
        const review = next.review, command = review?.moves[(review?.cursor ?? 0) - 1]
        const nextPosition = `${next.loadGeneration}:${review?.line}:${review?.cursor}`
        if (nextPosition !== position) {
            position = nextPosition; reference(); ui.commentText.value = ''; ui.commentStatus.textContent = ''
        }
        ui.comments.hidden = !review
        ui.commentHeading.textContent = command && command !== '---' ? `Comments · ply ${review!.cursor}` : 'Move comments'
        ui.commentText.disabled = !command || command === '---' || next.connection === 'closed' || !session.addComment
        ui.commentText.placeholder = command && command !== '---' ? 'Add a thought about this move…' : 'Select a played move to comment…'
        entry()
        const nextSignature = `${position}:${JSON.stringify(review?.comments)}`
        if (signature === nextSignature) return
        signature = nextSignature; reference(); ui.commentList.replaceChildren()
        if (!review?.comments.length) {
            const empty = document.createElement('p'); empty.className = 'comments-empty'
            empty.textContent = command && command !== '---' ? 'No comments on this move yet.' : 'Select a move to read or add comments.'
            ui.commentList.append(empty)
        }
        for (const comment of review?.comments ?? []) {
            const item = document.createElement('article'), header = document.createElement('div'), name = document.createElement('strong'), body = document.createElement('p')
            item.className = 'move-comment'; header.className = 'comment-byline'; name.textContent = comment.author ?? 'Anonymous'
            header.append(name)
            if (comment.truncated) {
                const badge = document.createElement('span'); badge.className = 'comment-truncated'; badge.textContent = 'Truncated'
                badge.title = 'This imported comment was shortened to the 500-character limit.'; header.append(badge)
            }
            for (const part of commentParts(comment.text)) {
                if (part.reference) {
                    const button = document.createElement('button'); button.type = 'button'; button.className = 'comment-reference'; button.textContent = part.text
                    const value = part.reference
                    const label = value.to ? `Show arrow ${coordToString(value.from)} to ${coordToString(value.to)}` : `Highlight square ${coordToString(value.from)}`
                    button.setAttribute('aria-label', label); button.title = label
                    button.onpointerenter = event => { if (event.pointerType !== 'touch') reference(value) }
                    button.onpointerleave = event => { if (event.pointerType !== 'touch') reference() }
                    button.onfocus = () => reference(value); button.onblur = () => reference()
                    button.onclick = () => reference(value, true)
                    button.onkeydown = event => { if (event.key === 'Escape') { reference(); event.preventDefault() } }
                    body.append(button)
                } else if (part.mention) {
                    const mention = document.createElement('span'); mention.className = 'comment-mention'; mention.textContent = part.text; body.append(mention)
                } else body.append(document.createTextNode(part.text))
            }
            item.append(header, body); ui.commentList.append(item)
        }
        ui.commentList.scrollTop = 0
    })
    return () => {
        active = false; unsubscribe(); reference()
        ui.commentText.oninput = null; ui.commentForm.onsubmit = null; ui.commentList.replaceChildren()
    }
}
