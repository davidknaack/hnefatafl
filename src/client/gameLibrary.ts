/** Fetch the static test corpus only when requested; keep source row order intact. */
let pending: Promise<readonly string[]> | undefined

export function loadGameLibrary(): Promise<readonly string[]> {
    if (!pending) {
        pending = fetch(new URL('./data/copenhagen.csv', import.meta.url))
            .then(async response => {
                if (!response.ok) throw new Error('Could not fetch the test game library')
                const games = (await response.text()).split(/\r?\n/).filter(row => row.trim().length > 0)
                if (!games.length) throw new Error('The test game library is empty')
                return games
            })
            .catch(error => { pending = undefined; throw error })
    }
    return pending
}
