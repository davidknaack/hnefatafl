import { expect, test } from 'vitest'
import { validRelayEndpoint } from './endpoint'

test('endpoint rules reject unsavable and credential-bearing addresses consistently', () => {
    for (const endpoint of ['', 'invalid', 'https://example.com/relay', 'ws://user:secret@localhost/relay',
        'ws://localhost/relay?token=secret', 'ws://localhost/relay#secret', 'ws://localhost/' + 'x'.repeat(2048)]) {
        expect(validRelayEndpoint(endpoint)).toBe(false)
    }
    expect(validRelayEndpoint('ws://127.0.0.1:8787/relay', 'http:')).toBe(true)
    expect(validRelayEndpoint('ws://127.0.0.1:8787/relay', 'https:')).toBe(false)
    expect(validRelayEndpoint('wss://example.com/relay', 'https:')).toBe(true)
})
