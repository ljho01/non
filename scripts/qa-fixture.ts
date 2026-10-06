import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNote, createBlock, serializeNote } from '../src/shared/contracts/note'
import { createCanvas, serializeCanvas } from '../src/shared/contracts/canvas'

const root = await mkdtemp(join(tmpdir(), 'non-qa-'))
await mkdir(join(root, 'Research'))
const sample = createNote('작은 생각들')
sample.blocks = [
  { ...createBlock(), text: '오래 남는 생각은 작은 메모에서 시작합니다.' },
  { ...createBlock('heading'), text: '오늘의 질문' },
  { ...createBlock('list-item'), text: '읽은 자료를 어떻게 내 언어로 정리할까?' },
  { ...createBlock('quote'), text: '읽는 것과 쓰는 것 사이에, 생각할 공간을 만듭니다.' },
  { ...createBlock('task'), text: 'PDF의 중요한 문장 모으기' },
  { ...createBlock('future-canvas'), data: { nodes: [{ x: 10, y: 20 }] } },
]
await writeFile(join(root, 'Research', '작은 생각들.note.json'), serializeNote(sample))
await writeFile(join(root, '시작하기.note.json'), serializeNote(createNote('나만의 연구실')))
await writeFile(join(root, '이전 노트.md'), '# 이전 노트\n원본 보존, 읽기 전용 확인용입니다.')
await writeFile(join(root, '생각 지도.excalidraw'), serializeCanvas(createCanvas()))
const stream =
  'BT /F1 26 Tf 60 710 Td (A space for thought.) Tj 0 -52 Td /F1 13 Tf (Non PDF rendering test - page one.) Tj 0 -30 Td (Read, annotate in your notes, and ask your assistant.) Tj ET'
const stream2 =
  'BT /F1 26 Tf 60 710 Td (Keep the connection.) Tj 0 -52 Td /F1 13 Tf (This is page two. Select this text to test the text layer.) Tj ET'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
  `<< /Length ${stream2.length} >>\nstream\n${stream2}\nendstream`,
]
let pdf = '%PDF-1.4\n'
const offsets = [0]
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
})
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
  .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
await writeFile(join(root, 'Reading.pdf'), pdf)
console.log(root)
