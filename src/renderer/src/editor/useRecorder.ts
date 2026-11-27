import { useEffect, useRef, useState } from 'react'
import type { Recording, StoredMedia } from '../../../shared/editor'
import { storeWebmRecording } from './audio'
import { onEditorClose } from './autosave'

export function useRecorder(onSaved: (recording: Recording, media: StoredMedia) => Promise<void> | void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = useRef<{ recorder: MediaRecorder; completion: Promise<void> } | null>(null)
  const starting = useRef(false)
  const mounted = useRef(false)

  async function stop(): Promise<void> {
    const session = active.current
    if (!session) return
    if (session.recorder.state !== 'inactive') session.recorder.stop()
    return session.completion
  }

  useEffect(() => {
    mounted.current = true
    const unregister = onEditorClose(stop)
    return () => {
      mounted.current = false
      void stop().catch(() => undefined).finally(unregister)
    }
  }, [])

  async function start(): Promise<void> {
    if (starting.current || active.current) return
    starting.current = true
    setBusy(true)
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return }
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const id = crypto.randomUUID()
      const startedAt = Date.now()
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      const completion = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => {
          const endedAt = Date.now()
          recorder.stream.getTracks().forEach((track) => track.stop())
          setRecording(false)
          setBusy(true)
          void storeWebmRecording(chunks, endedAt - startedAt).then((media) =>
            onSaved({ id, assetId: media.assetId, startedAt, endedAt }, media)
          ).then(resolve, (error: unknown) => { onError(`录音保存失败：${String(error)}`); reject(error) }).finally(() => {
            active.current = null
            setBusy(false)
          })
        }
      })
      void completion.catch(() => undefined)
      recorder.start(1000)
      active.current = { recorder, completion }
      setRecording(true)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      onError(`录音启动失败：${String(error)}`)
    } finally {
      starting.current = false
      setBusy(false)
    }
  }

  return { recording, busy, start, stop }
}
