import { expect, test, vi } from 'vitest'
import { LocalGameSession } from './LocalGameSession'
import { SessionOwner } from './SessionOwner'

test('replacement unbinds before disposal and rejects queued commands on the former session', async () => {
    const first = new LocalGameSession(), next = new LocalGameSession()
    const seen: string[] = []
    const owner = new SessionOwner(first, session => {
        seen.push('bind')
        const unsubscribe = session.subscribe(view => seen.push(view.connection))
        return () => { seen.push('unbind'); unsubscribe() }
    })
    const pending = first.submitMove('D11-D10', 0)
    owner.replace(next)
    expect(await pending).toMatchObject({ success: false })
    expect(first.getView().connection).toBe('closed')
    expect(next.getView().state.moveHistory).toEqual([])
    expect(owner.session).toBe(next)
    expect(seen).toEqual(['bind', 'ready', 'unbind', 'bind', 'ready'])
    owner.dispose()
    expect(seen[seen.length - 1]).toBe('unbind')
})

test('same-session replacement and repeated disposal are harmless; late candidates are disposed', () => {
    const first = new LocalGameSession(), late = new LocalGameSession()
    const cleanup = vi.fn(), bind = vi.fn(() => cleanup)
    const owner = new SessionOwner(first, bind)
    owner.replace(first)
    expect(bind).toHaveBeenCalledTimes(1)
    owner.dispose(); owner.dispose(); owner.replace(late)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(late.getView().connection).toBe('closed')
})
