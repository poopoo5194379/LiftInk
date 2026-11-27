import { join } from 'node:path'
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import type { AudioTranscript } from '../shared/editor'

let model: Promise<AutomaticSpeechRecognitionPipeline> | undefined
let queue: Promise<unknown> = Promise.resolve()

async function openModel(root: string): Promise<AutomaticSpeechRecognitionPipeline> {
  const { env, pipeline } = await import('@huggingface/transformers')
  env.cacheDir = process.env['LIFTINK_TEST_SPEECH_CACHE'] ?? join(root, 'speech-models')
  const loadSpeechPipeline = pipeline<'automatic-speech-recognition'>
  return loadSpeechPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { device: 'cpu', dtype: 'q8' })
}

export function transcribeAudio(
  root: string, assetId: unknown, waveform: unknown, language: unknown
): Promise<AudioTranscript> {
  if (language !== 'zh' && language !== 'en') throw new Error('不支持此转写语言')
  if (typeof assetId !== 'string' || !/^[a-f0-9]{64}\.webm$/.test(assetId) ||
      !(waveform instanceof Float32Array) || !waveform.length || waveform.length > 16_000 * 60 * 30) {
    throw new Error('转写支持最长 30 分钟的录音')
  }
  const result = queue.catch(() => undefined).then(async (): Promise<AudioTranscript> => {
    model ??= openModel(root).catch((error: unknown) => { model = undefined; throw error })
    const engine = await model
    const output = await engine(waveform, {
      return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', language
    })
    const spoken = Array.isArray(output) ? output[0] : output
    return {
      assetId,
      language,
      text: spoken.text.trim().slice(0, 150_000),
      segments: (spoken.chunks ?? []).flatMap((chunk) => {
        const [start, end] = chunk.timestamp
        const text = chunk.text.trim().slice(0, 5000)
        return Number.isFinite(start) && start >= 0 && text
          ? [{ start, end: end !== null && Number.isFinite(end) && end >= start ? end : null, text }]
          : []
      }).slice(0, 4000)
    }
  })
  queue = result
  return result
}
