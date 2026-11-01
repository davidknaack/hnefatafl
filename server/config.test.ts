import { expect, test } from 'vitest'
import { configFromEnv } from './config.js'

test('production and preview relays use their own generated web origin', () => {
    for (const origin of ['https://tafl.ac0kg.org', 'https://tafl-pr-35.ac0kg.org', 'http://localhost:8080']) {
        expect(configFromEnv({ NODE_ENV: 'production', SERVICE_URL_WEB: origin + '/' }, '1.0.0').allowedOrigins).toEqual([origin])
    }
    expect(configFromEnv({ RELAY_PUBLIC_URL: 'https://temporary.ac0kg.org', SERVICE_URL_WEB: 'https://tafl.ac0kg.org' }, '1.0.0')
        .allowedOrigins).toEqual(['https://temporary.ac0kg.org'])
})

test('explicit origins override generated origins, including deliberate rejection of all browser origins', () => {
    expect(configFromEnv({ NODE_ENV: 'production', RELAY_ORIGINS: 'https://one.example, https://two.example', SERVICE_URL_WEB: 'invalid' }, '1.0.0')
        .allowedOrigins).toEqual(['https://one.example', 'https://two.example'])
    expect(configFromEnv({ NODE_ENV: 'production', RELAY_ORIGINS: '' }, '1.0.0').allowedOrigins).toEqual([])
})

test('production refuses missing or malformed public origin configuration', () => {
    for (const publicUrl of [undefined, '', 'invalid', 'wss://tafl.ac0kg.org', 'https://user:secret@tafl.ac0kg.org',
        'https://tafl.ac0kg.org/path', 'https://tafl.ac0kg.org?token=secret', 'https://tafl.ac0kg.org#secret',
        'https://one.example,https://two.example']) {
        expect(() => configFromEnv({ NODE_ENV: 'production', SERVICE_URL_WEB: publicUrl }, '1.0.0')).toThrow()
    }
})
