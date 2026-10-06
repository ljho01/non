import { z } from 'zod'

export const CHAT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const CHAT_IMAGE_MAX_COUNT = 5
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_IMAGE_MAX_TOTAL_BYTES = 20 * 1024 * 1024

export type ChatImageMimeType = (typeof CHAT_IMAGE_MIME_TYPES)[number]
export type ChatImage = { data: string; mimeType: ChatImageMimeType }

export function base64ByteLength(data: string) {
  if (
    !data.length ||
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
    data.slice(0, -2).includes('=')
  )
    return null
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return (data.length / 4) * 3 - padding
}

export const chatImageSchema = z
  .object({
    data: z.string().min(4).max(Math.ceil((CHAT_IMAGE_MAX_BYTES * 4) / 3) + 4),
    mimeType: z.enum(CHAT_IMAGE_MIME_TYPES),
  })
  .superRefine((image, context) => {
    const bytes = base64ByteLength(image.data)
    if (bytes === null)
      context.addIssue({ code: 'custom', path: ['data'], message: 'Invalid base64 image data' })
    else if (bytes > CHAT_IMAGE_MAX_BYTES)
      context.addIssue({ code: 'custom', path: ['data'], message: 'Image exceeds 10 MB' })
  })

export const chatImagesSchema = z
  .array(chatImageSchema)
  .max(CHAT_IMAGE_MAX_COUNT)
  .superRefine((images, context) => {
    const bytes = images.reduce((total, image) => total + (base64ByteLength(image.data) ?? 0), 0)
    if (bytes > CHAT_IMAGE_MAX_TOTAL_BYTES)
      context.addIssue({ code: 'custom', message: 'Images exceed 20 MB in total' })
  })

