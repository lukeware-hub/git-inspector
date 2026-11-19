import type { Elements, ThemeKey } from 'claude-code'

// The grid of the Session Inspector band, so both mods line up the same way.

export type Ui = Pick<Elements[keyof Elements], 'Box' | 'Text'>

// A run of text and how it is painted.
export type Part = { text: string; color?: ThemeKey; bold?: boolean; dim?: boolean }

// One figure: an optional dim label, then its value.
export type Segment = Part & { label?: string }

// One row: its name, then one figure per column, or one message across the whole row, with any parts after it.
export type GridRow = { label: string; cells: Segment[]; span?: Segment & { more?: Part[] } }

const MIN_GAP = 3

// Cuts text to the room, ending with an ellipsis when it was longer.
export function fit(text: string, columns: number): string {
  const room = Math.max(1, Math.floor(columns))
  return text.length <= room ? text : `${text.slice(0, room - 1)}…`
}

function columnMax(rows: readonly GridRow[], column: number, measure: (cell: Segment) => number): number {
  return Math.max(0, ...rows.map(row => (row.span ? undefined : row.cells[column])).filter(cell => cell !== undefined).map(measure))
}

// Column N has one width in every row; gaps share the spare room so the widest last value ends on the right edge;
// whole columns leave from the right when the room runs out.
export function layoutGrid(rows: readonly GridRow[], columns: number, labelWidth: number): Part[][] {
  const room = Math.max(1, columns - labelWidth)
  const count = Math.max(0, ...rows.map(row => (row.span ? 0 : row.cells.length)))
  const labels = Array.from({ length: count }, (_, column) => columnMax(rows, column, cell => cell.label?.length ?? 0))
  const values = Array.from({ length: count }, (_, column) => columnMax(rows, column, cell => cell.text.length))
  const widths = labels.map((label, column) => (label ? label + 1 : 0) + (values[column] ?? 0))
  const natural = (keep: number) => widths.slice(0, keep).reduce((sum, width) => sum + width, 0) + MIN_GAP * Math.max(0, keep - 1)
  let keep = count
  while (keep > 1 && natural(keep) > room) keep--
  const gaps = Math.max(1, keep - 1)
  const spare = Math.max(0, room - natural(keep))
  const gapAfter = (column: number) => MIN_GAP + Math.floor(spare / gaps) + (column < spare % gaps ? 1 : 0)

  return rows.map(row => {
    const line: Part[] = [{ text: row.label.padEnd(labelWidth), dim: true }]
    if (row.span) {
      const { more = [], ...span } = row.span
      const moreWidth = more.reduce((sum, part) => sum + part.text.length, 0)
      return [...line, { ...span, text: fit(span.text, room - moreWidth) }, ...more]
    }
    const cells = row.cells.slice(0, keep)
    cells.forEach((cell, column) => {
      const label = labels[column] ?? 0
      if (label) line.push({ text: `${(cell.label ?? '').padEnd(label)} `, dim: true })
      line.push({ text: keep === 1 ? fit(cell.text, room - (label ? label + 1 : 0)) : cell.text, color: cell.color, bold: cell.bold, dim: cell.dim })
      if (column < cells.length - 1) line.push({ text: ' '.repeat((values[column] ?? 0) - cell.text.length + gapAfter(column)) })
    })
    return line
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
