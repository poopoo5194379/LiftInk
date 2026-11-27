import type { StoredImage } from '../../../shared/editor'

export const imageAccept = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

export function clipboardImages(data: DataTransfer | null): File[] {
  const isImage = (file: File): boolean => file.type.startsWith('image/') || imageMime(file) !== undefined
  const files = Array.from(data?.files ?? []).filter(isImage)
  return files.length ? files : Array.from(data?.items ?? []).flatMap((item) => {
    if (item.kind !== 'file') return []
    const file = item.getAsFile()
    return file && isImage(file) ? [file] : []
  })
}

export function imageMime(file: File): string | undefined {
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return file.type
  if (/\.png$/i.test(file.name)) return 'image/png'
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg'
  if (/\.webp$/i.test(file.name)) return 'image/webp'
  return undefined
}

export function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('无法读取图片'))
    image.src = dataUrl
  })
}

export async function storeImageFile(file: File): Promise<StoredImage> {
  const mime = imageMime(file)
  if (!mime || file.size > 20_000_000) throw new Error('请选择不超过 20 MB 的 PNG、JPG 或 WebP 图片')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return window.liftInk.storeImage(mime, btoa(binary))
}
