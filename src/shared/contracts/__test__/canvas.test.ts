import { expect, test } from 'bun:test'
import {
  canvasFilename,
  createCanvas,
  parseCanvas,
  serializeCanvas,
} from '../canvas'

test('Excalidraw canvases round trip and preserve extension fields', () => {
  const canvas = createCanvas()
  canvas.metadata = { createdIn: 'Non' }
  canvas.elements.push({ id: 'shape-1', type: 'rectangle', future: true })

  const parsed = parseCanvas(serializeCanvas(canvas))
  expect(parsed.type).toBe('excalidraw')
  expect(parsed.elements).toEqual(canvas.elements)
  expect(parsed.metadata).toEqual(canvas.metadata)
})

test('canvas filenames keep the interoperable Excalidraw extension', () => {
  expect(canvasFilename('Untitled')).toBe('Untitled.excalidraw')
  expect(canvasFilename('Board.excalidraw')).toBe('Board.excalidraw')
  expect(() => parseCanvas('{"type":"other"}')).toThrow()
})
