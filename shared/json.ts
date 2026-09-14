/** Bounds shared by the relay and browser; no engine or platform-specific imports. */
export const MAX_MESSAGE_BYTES = 64 * 1024
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Result<T> = { success: true; value: T } | { success: false; error: string }
export const failure = (error: string): { success: false; error: string } => ({ success: false, error })

export function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function text(value: unknown, max = 64): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function id(value: unknown): value is string {
    return text(value) && /^[A-Za-z0-9_-]+$/.test(value)
}

/** Accept wire text or an already-parsed value; always return a detached JSON value. */
export function readJson(input: unknown, maxBytes = MAX_MESSAGE_BYTES): Result<JsonValue> {
    try {
        const encoded = typeof input === 'string' ? input : JSON.stringify(input)
        if (typeof encoded !== 'string') return failure('Expected JSON')
        if (new TextEncoder().encode(encoded).length > maxBytes) return failure(`JSON exceeds ${maxBytes} bytes`)
        return { success: true, value: JSON.parse(encoded) as JsonValue }
    } catch {
        return failure('Invalid JSON')
    }
}
