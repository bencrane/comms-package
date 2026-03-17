export class EventBus {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map()

  on<T>(event: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const cb = callback as (data: unknown) => void
    this.listeners.get(event)!.add(cb)

    return () => {
      this.listeners.get(event)?.delete(cb)
    }
  }

  emit<T>(event: string, data: T): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach((cb) => cb(data))
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}
