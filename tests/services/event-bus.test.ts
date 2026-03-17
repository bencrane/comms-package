import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../../src/services/event-bus'

describe('EventBus', () => {
  it('on + emit delivers data to subscriber', () => {
    const bus = new EventBus()
    const callback = vi.fn()

    bus.on<string>('test', callback)
    bus.emit<string>('test', 'hello')

    expect(callback).toHaveBeenCalledWith('hello')
  })

  it('multiple subscribers all receive the event', () => {
    const bus = new EventBus()
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    bus.on<number>('test', cb1)
    bus.on<number>('test', cb2)
    bus.emit<number>('test', 42)

    expect(cb1).toHaveBeenCalledWith(42)
    expect(cb2).toHaveBeenCalledWith(42)
  })

  it('unsubscribe function prevents future deliveries', () => {
    const bus = new EventBus()
    const callback = vi.fn()

    const unsubscribe = bus.on<string>('test', callback)
    unsubscribe()
    bus.emit<string>('test', 'hello')

    expect(callback).not.toHaveBeenCalled()
  })

  it('removeAllListeners for a specific event clears only that event', () => {
    const bus = new EventBus()
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    bus.on<string>('event1', cb1)
    bus.on<string>('event2', cb2)
    bus.removeAllListeners('event1')

    bus.emit<string>('event1', 'a')
    bus.emit<string>('event2', 'b')

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledWith('b')
  })

  it('removeAllListeners with no args clears all events', () => {
    const bus = new EventBus()
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    bus.on<string>('event1', cb1)
    bus.on<string>('event2', cb2)
    bus.removeAllListeners()

    bus.emit<string>('event1', 'a')
    bus.emit<string>('event2', 'b')

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).not.toHaveBeenCalled()
  })
})
