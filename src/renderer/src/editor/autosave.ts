const saveInterval = 60_000
const pendingEditors = new Set<() => Promise<void>>()
const closeTasks = new Set<() => Promise<void>>()

export function onEditorClose(task: () => Promise<void>): () => void {
  closeTasks.add(task)
  return () => { closeTasks.delete(task) }
}

export async function prepareEditorsForClose(): Promise<void> {
  await Promise.all([...closeTasks].map((task) => task()))
  await flushEditorSaves()
}

export async function flushEditorSaves(): Promise<void> {
  while (pendingEditors.size) {
    const results = await Promise.allSettled([...pendingEditors].map((flush) => flush()))
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
}

export function createEditorAutosave(isWriting: () => boolean): {
  stage: (save: () => Promise<void>) => void
  flush: () => Promise<void>
} {
  let pending: (() => Promise<void>) | undefined
  let timer: number | undefined
  let inFlight: Promise<void> | undefined

  const schedule = (delay = saveInterval): void => {
    if (timer !== undefined) return
    timer = window.setTimeout(() => {
      timer = undefined
      if (isWriting()) schedule(250)
      else void flush().catch(() => undefined)
    }, delay)
  }

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight.then(flush)
    if (!pending) return Promise.resolve()
    window.clearTimeout(timer)
    timer = undefined
    const save = pending
    inFlight = Promise.resolve()
      .then(save)
      .then(() => { if (pending === save) pending = undefined })
      .finally(() => {
        inFlight = undefined
        if (pending) schedule()
        else pendingEditors.delete(flush)
      })
    return inFlight
  }

  return {
    stage(save) {
      pending = save
      pendingEditors.add(flush)
      schedule()
    },
    flush
  }
}
