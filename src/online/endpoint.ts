/** Resolve only the explicit deployment setting; saved endpoints must remain absolute. */
export function resolveRelayEndpoint(value: string | undefined, pageUrl: string): string | undefined {
    if (!value) return undefined
    try {
        const page = new URL(pageUrl)
        if (!['http:', 'https:'].includes(page.protocol)) return undefined
        // Only this exact opt-in enables same-origin deployment. Other relative URLs
        // (especially protocol-relative URLs) must not redirect saved credentials.
        if (value === '/relay') {
            const endpoint = new URL('/relay', page.origin)
            endpoint.protocol = page.protocol === 'https:' ? 'wss:' : 'ws:'
            return endpoint.href
        }
        return validRelayEndpoint(value, page.protocol) ? new URL(value).href : undefined
    } catch { return undefined }
}

/** Keep UI, session and persisted endpoints under the same transport contract. */
export function validRelayEndpoint(value: string, pageProtocol?: string): boolean {
    if (!value || value.length > 2048) return false
    try {
        const url = new URL(value)
        return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password &&
            !url.search && !url.hash && (pageProtocol !== 'https:' || url.protocol === 'wss:')
    } catch { return false }
}
