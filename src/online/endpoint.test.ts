import { expect, test } from 'vitest'
import { resolveRelayEndpoint, validRelayEndpoint } from './endpoint'

test('endpoint rules reject unsavable and credential-bearing addresses consistently', () => {
    for (const endpoint of ['', 'invalid', 'https://example.com/relay', 'ws://user:secret@localhost/relay',
        'ws://localhost/relay?token=secret', 'ws://localhost/relay#secret', 'ws://localhost/' + 'x'.repeat(2048)]) {
        expect(validRelayEndpoint(endpoint)).toBe(false)
    }
    expect(validRelayEndpoint('ws://127.0.0.1:8787/relay', 'http:')).toBe(true)
    expect(validRelayEndpoint('ws://127.0.0.1:8787/relay', 'https:')).toBe(false)
    expect(validRelayEndpoint('wss://example.com/relay', 'https:')).toBe(true)
})

test('same-origin deployment resolves production, preview and local endpoints to absolute URLs', () => {
    expect(resolveRelayEndpoint('/relay', 'https://tafl.ac0kg.org/#invite=ABCDEF')).toBe('wss://tafl.ac0kg.org/relay')
    expect(resolveRelayEndpoint('/relay', 'https://tafl-pr-35.ac0kg.org/game')).toBe('wss://tafl-pr-35.ac0kg.org/relay')
    expect(resolveRelayEndpoint('/relay', 'http://localhost:8080/')).toBe('ws://localhost:8080/relay')
    expect(resolveRelayEndpoint('ws://127.0.0.1:8787/relay', 'http://localhost:5173')).toBe('ws://127.0.0.1:8787/relay')
    expect(resolveRelayEndpoint('wss://relay.example/relay', 'https://tafl.ac0kg.org')).toBe('wss://relay.example/relay')
    // A same-origin configuration is resolved before recovery compares endpoints.
    expect(resolveRelayEndpoint('/relay', 'https://tafl.ac0kg.org')).not.toBe(resolveRelayEndpoint('/relay', 'https://tafl-pr-35.ac0kg.org'))
    expect(validRelayEndpoint('/relay')).toBe(false)
})

test('absent, insecure, ambiguous and credential-bearing deployment settings stay disabled', () => {
    for (const endpoint of [undefined, '', 'relay', '//evil.example/relay', '/relay?token=secret',
        'ws://tafl.ac0kg.org/relay', 'wss://user:secret@tafl.ac0kg.org/relay', 'wss://tafl.ac0kg.org/relay#secret']) {
        expect(resolveRelayEndpoint(endpoint, 'https://tafl.ac0kg.org')).toBeUndefined()
    }
    expect(resolveRelayEndpoint('/relay', 'file:///app/index.html')).toBeUndefined()
    expect(resolveRelayEndpoint('/relay', 'invalid')).toBeUndefined()
})
