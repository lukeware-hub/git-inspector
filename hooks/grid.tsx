import type { Elements, ThemeKey } from 'claude-code'

// The layouts of the Session Inspector band, so both mods look the same: a one-line grid, a bordered table for the
// terminal, and rows of cards for the desktop.

export type Ui = Pick<Elements[keyof Elements], 'Box' | 'Text'>

// A run of text and how it is painted.
export type Part = { text: string; color?: ThemeKey; bold?: boolean; dim?: boolean }

// One figure: an optional dim label, its value, and any further painted parts of the value.
// `optional` figures are the first to leave when the room is short.
export type Segment = Part & { label?: string; more?: Part[]; optional?: boolean }

// One row: its name, then one figure per column, or one message across the whole row, with any parts after it.
export type GridRow = { label: string; cells: Segment[]; span?: Segment }

export const MIN_GAP = 3

// Cuts text to the room, ending with an ellipsis when it was longer.
export function fit(text: string, columns: number): string {
  const room = Math.max(1, Math.floor(columns))
  return text.length <= room ? text : `${text.slice(0, room - 1)}…`
}

function partsWidth(parts: readonly Part[] | undefined): number {
  return (parts ?? []).reduce((sum, part) => sum + part.text.length, 0)
}

function valueWidth(segment: Segment): number {
  return segment.text.length + partsWidth(segment.more)
}

function columnMax(rows: readonly GridRow[], column: number, measure: (cell: Segment) => number): number {
  return Math.max(0, ...rows.map(row => (row.span ? undefined : row.cells[column])).filter(cell => cell !== undefined).map(measure))
}

// Long text keeps both ends: "C:/Users/…/workspace/app".
export function middle(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`
}

const MIN_CUT = 12

// A span's text cut so it and its further parts fit the room: the longest further part is cut in the middle first,
// then the text is cut, and the further parts leave when even a few cells of text would not fit.
function spanParts(span: Segment, room: number): Part[] {
  const more = span.more ?? []
  const part: Part = { text: span.text, color: span.color, bold: span.bold, dim: span.dim }
  const moreWidth = partsWidth(more)
  if (span.text.length + moreWidth <= room) return [part, ...more]
  const longest = more.reduce<Part | undefined>((best, one) => (one.text.length > (best?.text.length ?? 0) ? one : best), undefined)
  if (longest) {
    const free = room - span.text.length - (moreWidth - longest.text.length)
    if (free >= MIN_CUT) return [part, ...more.map(one => (one === longest ? { ...one, text: middle(one.text, free) } : one))]
  }
  if (room - moreWidth >= Math.min(span.text.length, 8)) return [{ ...part, text: fit(span.text, room - moreWidth) }, ...more]
  return [{ ...part, text: fit(span.text, room) }]
}

// Column N has one width in every row; gaps share the spare room so the widest last value ends on the right edge;
// whole columns leave from the right when the room runs out.
export function layoutGrid(rows: readonly GridRow[], columns: number, labelWidth: number): Part[][] {
  const room = Math.max(1, columns - labelWidth)
  const count = Math.max(0, ...rows.map(row => (row.span ? 0 : row.cells.length)))
  const labels = Array.from({ length: count }, (_, column) => columnMax(rows, column, cell => cell.label?.length ?? 0))
  const values = Array.from({ length: count }, (_, column) => columnMax(rows, column, valueWidth))
  const widths = labels.map((label, column) => (label ? label + 1 : 0) + (values[column] ?? 0))
  const natural = (keep: number) => widths.slice(0, keep).reduce((sum, width) => sum + width, 0) + MIN_GAP * Math.max(0, keep - 1)
  let keep = count
  while (keep > 1 && natural(keep) > room) keep--
  const gaps = Math.max(1, keep - 1)
  const spare = Math.max(0, room - natural(keep))
  const gapAfter = (column: number) => MIN_GAP + Math.floor(spare / gaps) + (column < spare % gaps ? 1 : 0)

  return rows.map(row => {
    const line: Part[] = [{ text: row.label.padEnd(labelWidth), dim: true }]
    if (row.span) return [...line, ...spanParts(row.span, room)]
    const cells = row.cells.slice(0, keep)
    cells.forEach((cell, column) => {
      const label = labels[column] ?? 0
      if (label) line.push({ text: `${(cell.label ?? '').padEnd(label)} `, dim: true })
      line.push({ text: keep === 1 ? fit(cell.text, room - (label ? label + 1 : 0)) : cell.text, color: cell.color, bold: cell.bold, dim: cell.dim }, ...(cell.more ?? []))
      const pad = (values[column] ?? 0) - valueWidth(cell) + gapAfter(column)
      if (column < cells.length - 1) line.push({ text: ' '.repeat(pad) })
    })
    return line
  })
}

// Below this many cells of width the table and the cards keep only the figures that are not optional.
export const NARROW_COLUMNS = 72

// Card columns by the room the cards have: four across, then two, then one.
export function cardColumns(room: number): 1 | 2 | 4 {
  if (room >= 84) return 4
  if (room >= 44) return 2
  return 1
}

// The terminal table takes two lines a row and one more for its bottom line; with the title and the frame it needs this much room.
export function tableFits(maxRows: number, rowCount: number): boolean {
  return maxRows >= 3 + 2 * rowCount + 1
}

// Lays rows out as one table whose neighbouring cells share a single line (╭┬╮ ├┼┤ ╰┴╯): column N has one width in every
// row, the spare room widens the columns so the table ends on the band's right edge, whole columns leave from the right
// when the room runs out, and optional figures leave first on a narrow band. A span row is one cell across the table.
// Border lines carry a blank row label; each content line carries its row's name.
export function tableLines(rows: readonly GridRow[], columns: number, labelWidth: number): Part[][] {
  const room = Math.max(1, columns - labelWidth)
  const isNarrow = columns < NARROW_COLUMNS
  const kept = rows.map(row => (row.span ? row : { ...row, cells: row.cells.filter(cell => !(isNarrow && cell.optional)) }))
  const count = Math.max(1, ...kept.map(row => (row.span ? 0 : row.cells.length)))
  // A cell holds a space, its label and a space, its value, and a space; the value sits right after its own label.
  const cellWidth = (cell: Segment) => (cell.label ? cell.label.length + 1 : 0) + valueWidth(cell)
  const content = Array.from({ length: count }, (_, column) => columnMax(kept, column, cellWidth) + 2)
  const natural = (keep: number) => content.slice(0, keep).reduce((sum, width) => sum + width, 0) + keep + 1
  let keep = count
  while (keep > 1 && natural(keep) > room) keep--
  const spare = Math.max(0, room - natural(keep))
  const widths = content.slice(0, keep).map((width, column) => width + Math.floor(spare / keep) + (column < spare % keep ? 1 : 0))
  const inner = widths.reduce((sum, width) => sum + width, 0) + keep - 1
  const blank = ' '.repeat(labelWidth)

  const border = (left: string, right: string, above?: GridRow, below?: GridRow): Part[] => {
    const hasUp = above !== undefined && !above.span
    const hasDown = below !== undefined && !below.span
    const join = hasUp && hasDown ? '┼' : hasUp ? '┴' : hasDown ? '┬' : '─'
    return [{ text: blank }, { text: left + widths.map(width => '─'.repeat(width)).join(join) + right, dim: true }]
  }

  const contentLine = (row: GridRow): Part[] => {
    const line: Part[] = [{ text: row.label.padEnd(labelWidth), dim: true }, { text: '│', dim: true }]
    if (row.span) {
      const parts = spanParts(row.span, Math.max(1, inner - 2))
      line.push({ text: ' ' }, ...parts, { text: ' '.repeat(Math.max(0, inner - 2 - partsWidth(parts)) + 1) }, { text: '│', dim: true })
      return line
    }
    widths.forEach((width, column) => {
      const cell = row.cells[column]
      if (!cell) {
        line.push({ text: ' '.repeat(width) })
      } else {
        const label = cell.label ? cell.label.length + 1 : 0
        const room_ = width - 2 - label
        const text = fit(cell.text, Math.max(1, room_))
        const more = text === cell.text ? (cell.more ?? []) : []
        const used = text.length + partsWidth(more)
        line.push({ text: ' ' })
        if (cell.label) line.push({ text: `${cell.label} `, dim: true })
        line.push({ text, color: cell.color, bold: cell.bold, dim: cell.dim }, ...more, { text: ' '.repeat(Math.max(0, room_ - used) + 1) })
      }
      line.push({ text: '│', dim: true })
    })
    return line
  }

  const lines: Part[][] = [border('╭', '╮', undefined, kept[0])]
  kept.forEach((row, index) => {
    lines.push(contentLine(row))
    const next = kept[index + 1]
    lines.push(next ? border('├', '┤', row, next) : border('╰', '╯', row, undefined))
  })
  return lines
}

function paint(ui: Ui, part: Part) {
  const { Text } = ui
  return (
    <Text color={part.color} bold={part.bold} dimColor={part.dim} wrap="truncate-end">
      {part.text}
    </Text>
  )
}

// One figure as a card, label and value on one line; a watch or danger value colors the border too.
function card(ui: Ui, cell: Segment | undefined, width: number | string) {
  const { Box, Text } = ui
  if (!cell) return <Box width={width} flexShrink={0} />
  const isAlert = cell.color === 'warning' || cell.color === 'error'
  return (
    // The card clips what does not fit, so a long value never runs into the next card.
    <Box width={width} flexShrink={0} flexDirection="row" columnGap={1} borderStyle="round" borderColor={isAlert ? cell.color : undefined} paddingX={1} paddingY={0} overflow="hidden">
      {cell.label && (
        <Box flexShrink={0}>
          <Text dimColor>{cell.label}</Text>
        </Box>
      )}
      <Box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden">
        {paint(ui, cell)}
        {(cell.more ?? []).map(part => paint(ui, part))}
      </Box>
    </Box>
  )
}

// A message row as one card across the whole width, bordered like the figure cards; a watch or danger message colors the border.
function spanCard(ui: Ui, span: Segment) {
  const { Box } = ui
  const isAlert = span.color === 'warning' || span.color === 'error'
  return (
    <Box width="100%" flexShrink={0} flexDirection="row" borderStyle="round" borderColor={isAlert ? span.color : undefined} paddingX={1} paddingY={0} overflow="hidden">
      {paint(ui, span)}
      {(span.more ?? []).map(part => paint(ui, part))}
    </Box>
  )
}

// The band as rows of cards packed edge to edge: a narrow dim label column, then the figures in a grid whose columns
// line up in every row (empty slots hold the place), wrapping to fewer columns as the room shrinks.
export function cardRows(ui: Ui, rows: readonly GridRow[], columns: number, labelWidth: number) {
  const { Box, Text } = ui
  const room = Math.max(1, columns - labelWidth)
  const isNarrow = columns < NARROW_COLUMNS
  // The widest card (label, value, border and padding), with a margin for the desktop's wider glyphs.
  const widest = Math.max(0, ...rows.flatMap(row => row.cells.filter(cell => !(isNarrow && cell.optional)).map(cell => (cell.label ? cell.label.length + 1 : 0) + valueWidth(cell) + 4)))
  const needed = Math.ceil(widest * 1.2)
  const across = Math.min(cardColumns(room), room >= needed * 4 ? 4 : room >= needed * 2 ? 2 : 1) as 1 | 2 | 4
  const width = `${100 / across}%`
  return rows.map(row => {
    const cells = row.cells.filter(cell => !(isNarrow && cell.optional))
    const slots = Math.max(cells.length, 1)
    const padded = across === 1 ? slots : Math.ceil(slots / across) * across
    return (
      <Box flexDirection="row" alignItems="center" gap={0}>
        <Box width={labelWidth} flexShrink={0}>
          <Text dimColor>{row.label}</Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} gap={0} columnGap={0} rowGap={0}>
          {row.span ? (
            spanCard(ui, row.span)
          ) : (
            Array.from({ length: padded }, (_, index) => card(ui, cells[index], width))
          )}
        </Box>
      </Box>
    )
  })
}

// One laid-out line as a row of painted texts.
export function gridLine(ui: Ui, parts: readonly Part[]) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row">
      {parts.map(part => (
        <Text color={part.color} bold={part.bold} dimColor={part.dim}>
          {part.text}
        </Text>
      ))}
    </Box>
  )
}
