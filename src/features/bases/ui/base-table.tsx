import { useVault } from '@/entities/vault'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { propertyConfig } from '@/shared/contracts/base'
import { parseTSV, encodeTSV } from '@/shared/contracts/tabular'
import { useRef, useState, type ReactNode } from 'react'
import type { Base, BaseView } from '@/shared/contracts/base'
import { propertyText } from '@/shared/contracts/properties'
import { Button } from '@/shared/ui/button'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/shared/ui/context-menu'
import { cn, errorText } from '@/shared/lib/utils'
import { desktop } from '@/shared/api/desktop'
import { summarize, type QueryRow } from '../model/query'
import { pasteValue, type PropertyEdit } from '../model/edits'
import type { BaseRecord } from '../model/records'
type Point = { row: number; col: number }
export function BaseTable({
  rows,
  columns,
  base,
  view,
  patch,
  renderCell,
  onEdit,
  onApply,
  onHistory,
  onError,
  onOpen,
}: {
  rows: QueryRow[]
  columns: string[]
  base: Base
  view: BaseView
  patch: (p: Partial<BaseView>) => void
  renderCell: (r: QueryRow, p: string) => ReactNode
  onEdit: (r: QueryRow, p: string) => void
  onApply: (e: PropertyEdit[]) => Promise<void>
  onHistory: (redo: boolean) => Promise<void>
  onError: (s: string) => void
  onOpen: (path: string) => void
}) {
  const [operation, setOperation] = useState<{
    kind: 'rename' | 'move'
    path: string
    value: string
  } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<Point | null>(null),
    [focus, setFocus] = useState<Point | null>(null)
  const [widths, setWidths] = useState<Record<string, number>>({})
  const low = {
    row: Math.min(anchor?.row ?? 0, focus?.row ?? 0),
    col: Math.min(anchor?.col ?? 0, focus?.col ?? 0),
  }
  const high = {
    row: Math.max(anchor?.row ?? 0, focus?.row ?? 0),
    col: Math.max(anchor?.col ?? 0, focus?.col ?? 0),
  }
  const selected = (r: number, c: number) =>
    !!anchor && r >= low.row && r <= high.row && c >= low.col && c <= high.col
  const select = (p: Point, extend = false) => {
    if (!extend || !anchor) setAnchor(p)
    setFocus(p)
    root.current?.focus()
  }
  const copy = () =>
    encodeTSV(
      rows
        .slice(low.row, high.row + 1)
        .map((r) => columns.slice(low.col, high.col + 1).map((p) => propertyText(r.cells[p]))),
    )
  const clear = () =>
    onApply(
      rows
        .slice(low.row, high.row + 1)
        .flatMap((r) =>
          columns
            .slice(low.col, high.col + 1)
            .map((property) => ({ record: r.row as BaseRecord, property, value: undefined })),
        ),
    )
  const run = (promise: Promise<unknown>) => {
    void promise.catch((e) => onError(errorText(e)))
  }
  const foot = (
    <tr>
      {columns.map((p) => {
        let text = ''
        try {
          if (view.summaries?.[p])
            text = `${view.summaries[p]}: ${propertyText(
              summarize(
                rows.map((r) => r.cells[p]),
                view.summaries[p],
                base,
                rows[0]?.row,
              ),
            )}`
        } catch (e) {
          text = errorText(e)
        }
        return (
          <td key={p} className="px-2 py-3 text-xs text-muted-foreground">
            {text}
          </td>
        )
      })}
    </tr>
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={root}
          tabIndex={0}
          role="grid"
          aria-label="데이터베이스 표"
          aria-rowcount={rows.length}
          aria-colcount={columns.length}
          className="overflow-auto rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onCopy={(e) => {
            if (anchor) {
              e.preventDefault()
              e.clipboardData.setData('text/plain', copy())
            }
          }}
          onPaste={(e) => {
            if (!anchor) return
            e.preventDefault()
            try {
              const matrix = parseTSV(e.clipboardData.getData('text/plain'))
              const edits: PropertyEdit[] = []
              const countR = matrix.length === 1 ? high.row - low.row + 1 : matrix.length
              for (let r = 0; r < countR; r++) {
                const row = rows[low.row + r]
                if (!row) break
                const cells = matrix[r % matrix.length]
                const countC = cells.length === 1 ? high.col - low.col + 1 : cells.length
                for (let c = 0; c < countC; c++) {
                  const property = columns[low.col + c]
                  if (property)
                    edits.push({
                      record: row.row as BaseRecord,
                      property,
                      value: pasteValue(cells[c % cells.length], row.cells[property] ?? rows.find(r=>r.cells[property]!=null)?.cells[property]),
                    })
                }
              }
              run(onApply(edits))
            } catch (e) {
              onError(errorText(e))
            }
          }}
          onKeyDown={(e) => {
            if (e.target !== root.current) return
            const cmd = e.metaKey || e.ctrlKey,
              point = focus ?? { row: 0, col: 0 }
            if (cmd && e.key.toLowerCase() === 'z') {
              e.preventDefault()
              run(onHistory(e.shiftKey))
              return
            }
            if (cmd && e.key.toLowerCase() === 'a') {
              e.preventDefault()
              setAnchor({ row: 0, col: 0 })
              setFocus({ row: rows.length - 1, col: columns.length - 1 })
              return
            }
            if (e.key === 'Escape') {
              setAnchor(null)
              setFocus(null)
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              if (rows[point.row] && columns[point.col]) onEdit(rows[point.row], columns[point.col])
              return
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
              e.preventDefault()
              if (anchor) run(clear())
              return
            }
            if (e.code === 'Space' && (e.shiftKey || e.ctrlKey)) {
              e.preventDefault()
              setAnchor(e.ctrlKey ? { row: 0, col: point.col } : { row: point.row, col: 0 })
              setFocus(
                e.ctrlKey
                  ? { row: rows.length - 1, col: point.col }
                  : { row: point.row, col: columns.length - 1 },
              )
              return
            }
            let { row, col } = point
            if (e.key === 'ArrowDown') row = cmd ? rows.length - 1 : row + 1
            else if (e.key === 'ArrowUp') row = cmd ? 0 : row - 1
            else if (e.key === 'ArrowLeft') col = cmd ? 0 : col - 1
            else if (e.key === 'ArrowRight') col = cmd ? columns.length - 1 : col + 1
            else if (e.key === 'Home') col = 0
            else if (e.key === 'End') col = columns.length - 1
            else if (e.key === 'PageDown')
              row += Math.max(1, Math.floor((root.current?.clientHeight ?? 300) / 40))
            else if (e.key === 'PageUp')
              row -= Math.max(1, Math.floor((root.current?.clientHeight ?? 300) / 40))
            else if (e.key === 'Tab') {
              col += e.shiftKey ? -1 : 1
              if (col >= columns.length) {
                col = 0
                row++
              }
              if (col < 0) {
                col = columns.length - 1
                row--
              }
            } else return
            e.preventDefault()
            select(
              {
                row: Math.max(0, Math.min(rows.length - 1, row)),
                col: Math.max(0, Math.min(columns.length - 1, col)),
              },
              e.shiftKey && e.key !== 'Tab',
            )
            requestAnimationFrame(() =>
              root.current
                ?.querySelector('[data-focus="true"]')
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
            )
          }}
        >
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              {columns.map((p) => (
                <col
                  key={p}
                  style={{
                    width:
                      widths[p] ??
                      Number((view.columnSize as Record<string, number> | undefined)?.[p] ?? 180),
                  }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((p, c) => (
                  <th
                    key={p}
                    className="relative border-b px-2 py-2 text-left text-xs font-medium text-muted-foreground"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/non-base-column', p)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const from = columns.indexOf(
                        e.dataTransfer.getData('application/non-base-column'),
                      )
                      if (from < 0) return
                      const order = [...columns]
                      order.splice(c, 0, order.splice(from, 1)[0])
                      patch({ order })
                    }}
                  >
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <Button
                          unstyled
                          className="w-full truncate text-left"
                          onClick={() =>
                            patch({
                              sort: [
                                {
                                  property: p,
                                  direction:
                                    view.sort?.[0]?.property === p &&
                                    view.sort[0].direction === 'ASC'
                                      ? 'DESC'
                                      : 'ASC',
                                },
                              ],
                            })
                          }
                        >
                          {propertyConfig(base, p)?.displayName ??
                            p.replace(/^(file|note|formula)\./, '')}
                          {view.sort?.[0]?.property === p
                            ? view.sort[0].direction === 'ASC'
                              ? ' ↑'
                              : ' ↓'
                            : ''}
                        </Button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onSelect={() => patch({ order: columns.filter((v) => v !== p) })}
                        >
                          속성 숨기기
                        </ContextMenuItem>
                        {[
                          'Empty',
                          'Filled',
                          'Unique',
                          'Sum',
                          'Average',
                          'Median',
                          'Min',
                          'Max',
                          'Range',
                          'Stddev',
                          'Checked',
                          'Unchecked',
                          'Earliest',
                          'Latest',
                        ].map((name) => (
                          <ContextMenuItem
                            key={name}
                            onSelect={() => patch({ summaries: { ...view.summaries, [p]: name } })}
                          >
                            {name}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                    <Button
                      unstyled
                      aria-label={`${p} 열 너비`}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/20"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        const start = e.clientX,
                          initial =
                            widths[p] ??
                            Number(
                              (view.columnSize as Record<string, number> | undefined)?.[p] ?? 180,
                            )
                        e.currentTarget.setPointerCapture(e.pointerId)
                        const element = e.currentTarget
                        let width = initial
                        const move = (ev: PointerEvent) => {
                          width = Math.max(72, Math.min(1200, initial + ev.clientX - start))
                          setWidths((v) => ({ ...v, [p]: width }))
                        }
                        const up = () => {
                          element.removeEventListener('pointermove', move)
                          element.removeEventListener('pointerup', up)
                          patch({
                            columnSize: {
                              ...((view.columnSize as Record<string, number>) ?? {}),
                              [p]: width,
                            },
                          })
                        }
                        element.addEventListener('pointermove', move)
                        element.addEventListener('pointerup', up)
                      }}
                    />
                  </th>
                ))}
              </tr>
              {view.groupBy && view.summaries && foot}
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.row.path}>
                  {columns.map((p, ci) => (
                    <td
                      role="gridcell"
                      aria-selected={selected(ri, ci)}
                      key={p}
                      data-focus={focus?.row === ri && focus.col === ci}
                      className={cn(
                        'overflow-hidden border-b border-border/50 px-2 align-top',
                        selected(ri, ci)
                          ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                          : 'hover:bg-muted/30',
                        view.rowHeight === 'short'
                          ? 'py-0.5'
                          : view.rowHeight === 'tall'
                            ? 'py-4'
                            : view.rowHeight === 'extra-tall'
                              ? 'py-7'
                              : 'py-1.5',
                      )}
                      onClickCapture={(e) => {
                        e.stopPropagation()
                        select({ row: ri, col: ci }, e.shiftKey)
                      }}
                      onDoubleClick={() => onEdit(r, p)}
                      onContextMenu={() => {
                        if (!selected(ri, ci)) select({ row: ri, col: ci })
                      }}
                    >
                      {renderCell(r, p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {!view.groupBy && view.summaries && <tfoot>{foot}</tfoot>}
          </table>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => run(navigator.clipboard.writeText(copy()))}>
          복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => run(clear())}>속성 값 지우기</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => rows.slice(low.row, high.row + 1).forEach((r) => onOpen(r.row.path))}
        >
          선택한 파일 열기
        </ContextMenuItem>
        <ContextMenuItem
          disabled={low.row !== high.row}
          onSelect={() => {
            const row = rows[low.row]
            if (row)
              setOperation({
                kind: 'rename',
                path: row.row.path,
                value: row.row.path.split('/').at(-1) ?? '',
              })
          }}
        >
          이름 변경
        </ContextMenuItem>
        <ContextMenuItem
          disabled={low.row !== high.row}
          onSelect={() => {
            const row = rows[low.row]
            if (row)
              setOperation({ kind: 'move', path: row.row.path, value: String(row.row.file.folder) })
          }}
        >
          폴더로 이동
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            run(
              (async () => {
                for (const row of rows.slice(low.row, high.row + 1))
                  await useVault.getState().archive(row.row.path)
              })(),
            )
          }
        >
          선택한 파일 보관
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const row = rows[low.row]
            if (row) run(desktop.reveal(row.row.path))
          }}
        >
          Finder에서 보기
        </ContextMenuItem>
      </ContextMenuContent>
      <Dialog
        open={!!operation}
        onOpenChange={(open) => {
          if (!open) setOperation(null)
        }}
      >
        <DialogContent>
          <DialogTitle>{operation?.kind === 'rename' ? '이름 변경' : '폴더로 이동'}</DialogTitle>
          <DialogDescription className="mt-2 text-xs text-muted-foreground">
            {operation?.path}
          </DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!operation) return
              run(
                (async () => {
                  if (operation.kind === 'rename')
                    await useVault.getState().rename(operation.path, operation.value)
                  else await useVault.getState().move(operation.path, operation.value)
                  setOperation(null)
                })(),
              )
            }}
          >
            <Input
              autoFocus
              aria-label={operation?.kind === 'rename' ? '새 파일 이름' : '대상 폴더'}
              value={operation?.value ?? ''}
              onChange={(e) => setOperation((v) => (v ? { ...v, value: e.target.value } : v))}
            />
            <Button type="submit">적용</Button>
          </form>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  )
}
