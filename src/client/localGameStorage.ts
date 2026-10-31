import { LocalGameSession } from '../session/LocalGameSession'

/** Separate from the debug harness's credential-bearing online recovery slot. */
export const LOCAL_GAME_KEY = 'hnefatafl.local-game.v1'
export type LocalGameStorage = Pick<Storage, 'getItem' | 'setItem'>
export const SAVED_GAME_NOTE = 'Current game and review position are saved automatically in this browser. Save / copy keeps a separate backup.'

/** Storage can be disabled or injected by embedded consumers and browser checks. */
export function createLocalGameStorage(getStorage: () => LocalGameStorage, report: (message: string) => void) {
    let preserve = false
    return {
        restore(): LocalGameSession | undefined {
            let candidate: LocalGameSession | undefined
            try {
                const text = getStorage().getItem(LOCAL_GAME_KEY)
                if (text === null) return
                if (!text.trimStart().startsWith('{')) throw new Error('Invalid local game snapshot')
                candidate = new LocalGameSession({ review: true })
                const result = candidate.loadGame(text, candidate.getView().generation)
                if (!result.success) throw new Error(result.error)
                return candidate
            } catch {
                candidate?.dispose(); preserve = true
                report('The saved game could not be restored. It has been kept in browser storage; playing or loading a game will replace it. Save / copy keeps a separate backup.')
                return
            }
        },
        bind(session: LocalGameSession): () => void {
            let first = true
            return session.subscribe(view => {
                const skip = first && preserve
                first = false
                if (skip) preserve = false
                if (skip || view.connection === 'closed' || !view.review) return
                try {
                    // Write on every committed update, including navigation and descriptions,
                    // rather than relying on unload events that may never be delivered.
                    getStorage().setItem(LOCAL_GAME_KEY, session.saveLocalState())
                    preserve = false; report(SAVED_GAME_NOTE)
                } catch {
                    report('This game could not be saved in browser storage. Use Save / copy to keep it before leaving the page.')
                }
            })
        },
    }
}
