import { fixWebmDuration } from '@fix-webm-duration/fix'
import type { StoredMedia } from '../../../shared/editor'

export async function storeWebmRecording(chunks: BlobPart[], duration: number): Promise<StoredMedia> {
  const blob = await fixWebmDuration(new Blob(chunks, { type: 'audio/webm' }), duration, { logger: false })
  if (blob.size > 50_000_000) throw new Error('录音文件超过 50 MB')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return window.liftInk.storeMedia('audio/webm', btoa(binary))
}
