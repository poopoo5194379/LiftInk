import { useEffect, useEffectEvent, useState } from 'react'
import type { NoteRecord } from '../../../shared/editor'
import { dayKey } from './noteActivity'

export type FocusReporter = (id: string, day: string, ms: number, closing?: boolean) => void

export function useNoteFocus(note: Pick<NoteRecord, 'id' | 'focusByDay'> | undefined, active: boolean, report?: FocusReporter): number {
  const [unsent, setUnsent] = useState(0)
  const notify = useEffectEvent((day: string, time: number, closing: boolean) => {
    if (note && time > 0) report?.(note.id, day, closing ? (note.focusByDay?.[day] ?? 0) + time : time, closing)
  })
  const id = note?.id
  useEffect(() => {
    if (!id || !active || !report) return
    let checkpoint = Date.now()
    let lastActivity = checkpoint
    let focused = document.hasFocus() && document.visibilityState === 'visible'
    const pending = new Map<string, number>()
    const idleAfter = 120_000
    const advance = (now: number): void => {
      const end = focused ? Math.min(now, lastActivity + idleAfter) : checkpoint
      while (checkpoint < end) {
        const date = new Date(checkpoint)
        const day = dayKey(date)
        date.setHours(24, 0, 0, 0)
        const next = Math.min(end, date.getTime())
        pending.set(day, (pending.get(day) ?? 0) + next - checkpoint)
        checkpoint = next
      }
      checkpoint = now
    }
    const flush = (closing = false): void => {
      advance(Date.now())
      for (const [day, time] of pending) notify(day, time, closing)
      pending.clear()
    }
    const activity = (): void => {
      const now = Date.now()
      if (now - lastActivity >= idleAfter) advance(now)
      lastActivity = now
    }
    const visibility = (): void => {
      advance(Date.now())
      focused = document.hasFocus() && document.visibilityState === 'visible'
      if (focused) lastActivity = Date.now()
    }
    let lastReport = checkpoint
    const interval = window.setInterval(() => {
      const now = Date.now()
      if (now - lastReport >= 15_000) { flush(); lastReport = now }
      else advance(now)
      setUnsent([...pending.values()].reduce((sum, time) => sum + time, 0))
    }, 1000)
    const close = (): void => flush(true)
    const eventTypes = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
    for (const type of eventTypes) window.addEventListener(type, activity, { passive: true })
    window.addEventListener('focus', visibility)
    window.addEventListener('blur', visibility)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('beforeunload', close)
    return () => {
      for (const type of eventTypes) window.removeEventListener(type, activity)
      window.removeEventListener('focus', visibility)
      window.removeEventListener('blur', visibility)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('beforeunload', close)
      window.clearInterval(interval)
      flush()
    }
  }, [active, id, report !== undefined])
  return active ? unsent : 0
}
