/** Keep UI, session and persisted endpoints under the same transport contract. */
export function validRelayEndpoint(value: string, pageProtocol?: string): boolean {
    if (!value || value.length > 2048) return false
    try {
        const url = new URL(value)
        return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password &&
            !url.search && !url.hash && (pageProtocol !== 'https:' || url.protocol === 'wss:')
    } catch { return false }
}
