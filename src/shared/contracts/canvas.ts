import { z } from 'zod'

export const canvasSchema = z.looseObject({
  type: z.literal('excalidraw'),
  version: z.number().int().nonnegative(),
  source: z.string(),
  elements: z.array(z.unknown()),
  appState: z.record(z.string(), z.unknown()),
  files: z.record(z.string(), z.unknown()).optional(),
})

export type CanvasDocument = z.infer<typeof canvasSchema>

export function createCanvas(): CanvasDocument {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'non',
    elements: [],
    appState: {
      gridSize: null,
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  }
}

export function parseCanvas(content: string): CanvasDocument {
  const value: unknown = JSON.parse(content)
  return canvasSchema.parse(value)
}

export function serializeCanvas(canvas: CanvasDocument) {
  return `${JSON.stringify(canvas, null, 2)}\n`
}

export function canvasFilename(title: string) {
  return /\.excalidraw$/i.test(title) ? title : `${title}.excalidraw`
}
