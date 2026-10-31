/** Minimal transport surface; callbacks are removed before replacement/disposal. */
export interface SessionSocket {
    readonly readyState: number
    readonly bufferedAmount: number
    send(text: string): void
    close(): void
    listen(callbacks: {
        open(): void
        message(data: unknown): void
        close(): void
        error(): void
    }): () => void
}

export function browserSocket(url: string): SessionSocket {
    const socket = new WebSocket(url)
    return {
        get readyState() { return socket.readyState },
        get bufferedAmount() { return socket.bufferedAmount },
        send: (text) => socket.send(text),
        close: () => socket.close(),
        listen(callbacks) {
            const message = (event: MessageEvent) => callbacks.message(event.data)
            socket.addEventListener('open', callbacks.open)
            socket.addEventListener('message', message)
            socket.addEventListener('close', callbacks.close)
            socket.addEventListener('error', callbacks.error)
            return () => {
                socket.removeEventListener('open', callbacks.open)
                socket.removeEventListener('message', message)
                socket.removeEventListener('close', callbacks.close)
                socket.removeEventListener('error', callbacks.error)
            }
        },
    }
}
