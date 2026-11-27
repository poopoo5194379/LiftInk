import { useEffect, useRef, useState } from 'react'
import type { AudioTranscript, SpeechLanguage } from '../../../shared/editor'

async function decodeRecording(dataUrl: string): Promise<Float32Array> {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const context = new OfflineAudioContext(1, 1, 16_000)
  const audio = await context.decodeAudioData(bytes.buffer)
  if (audio.duration > 30 * 60) throw new Error('转写支持最长 30 分钟的录音')
  if (audio.numberOfChannels === 1) return audio.getChannelData(0)
  const mixed = new Float32Array(audio.length)
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const source = audio.getChannelData(channel)
    for (let i = 0; i < mixed.length; i++) mixed[i] += source[i] / audio.numberOfChannels
  }
  return mixed
}

function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export default function AudioTranscription({ assetId, url, result, onResult, onSeek, retainResult = false }: {
  assetId: string
  url: string
  result?: AudioTranscript
  onResult: (result: AudioTranscript) => void
  retainResult?: boolean
  onSeek?: (seconds: number) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [language, setLanguage] = useState<SpeechLanguage>(result?.language ?? 'zh')
  const [status, setStatus] = useState('')
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const run = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setStatus('正在准备模型并转写…')
    try {
      const result = await window.liftInk.transcribeAudio(assetId, await decodeRecording(url), language)
      if (alive.current || retainResult) onResult(result)
      if (!alive.current) return
      setStatus(result.text ? '转写完成' : '这段录音中没有识别出语音')
    } catch (error) {
      if (alive.current) setStatus(`转写失败：${String(error)}`)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <section className="audio-transcription" aria-label="录音转写">
      <div className="audio-transcription-actions">
        <select aria-label="转写语言" value={language} disabled={busy}
          onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'zh')}>
          <option value="zh">普通话</option>
          <option value="en">English</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void run()}>{result?.text ? '重新转写' : '录音转文字'}</button>
        <span>{status || '首次使用需下载语音模型，录音在本机处理。'}</span>
      </div>
      {result?.text && (
        <div className="audio-transcription-body">
          <button type="button" onClick={() => void navigator.clipboard.writeText(result.text).then(() => setStatus('已复制文字')).catch(() => setStatus('复制失败'))}>复制全文</button>
          {onSeek && result.segments.length ? result.segments.map((segment, index) => (
            <button className="audio-transcription-segment" type="button" key={index} onClick={() => onSeek(segment.start)}>
              <time>{timeLabel(segment.start)}</time>{segment.text}
            </button>
          )) : <p>{result.text}</p>}
        </div>
      )}
    </section>
  )
}
