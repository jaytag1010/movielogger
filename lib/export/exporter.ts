import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { MediaEntry, MediaStatus } from '@/types/media'
import { Timestamp } from 'firebase/firestore'
import { calculateTotalWatchHours } from '@/utils/watchTime'
import { getEffectiveMediaType } from '@/utils/formatters'

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  return ts.toDate().toISOString().split('T')[0]
}

function entryToRow(entry: MediaEntry) {
  return {
    'ID Number': entry.internalId,
    'Legacy ID': entry.legacyId ?? '',
    'TMDB ID': entry.tmdbId ?? '',
    Title: entry.title,
    Type: entry.type,
    'Season Number': entry.seasonNumber ?? '',
    'Next Episode': entry.nextEpisodeToWatch ?? '',
    Status: entry.status,
    'Year Made': entry.yearMade ?? '',
    'Total Episodes': entry.totalEpisodes ?? '',
    'Episode Duration': entry.episodeDurationMinutes ?? '',
    'Episode Average Duration': entry.episodeDurationMinutes ?? '',
    'Watch Hours': entry.watchHours ?? '',
    'Rewatch Count': entry.rewatchCount ?? 0,
    'Personal Rating': entry.personalRating ?? '',
    Priority: entry.priority ?? '',
    'Date Finished': formatTimestamp(entry.dateFinished),
    'Special Notes': entry.specialNotes ?? '',
    'Age Rating': entry.ageRating ?? '',
    Genres: entry.genres?.join(', ') ?? '',
    Country: entry.country ?? '',
    'Poster URL': entry.posterUrl ?? '',
    'Backdrop URL': entry.backdropUrl ?? '',
    'Created At': formatTimestamp(entry.createdAt),
  }
}

type ExportRow = ReturnType<typeof entryToRow>
type TableRow = [string, number]

const MAIN_HEADERS: (keyof ExportRow)[] = [
  'ID Number',
  'Legacy ID',
  'TMDB ID',
  'Title',
  'Type',
  'Season Number',
  'Next Episode',
  'Status',
  'Year Made',
  'Total Episodes',
  'Episode Duration',
  'Episode Average Duration',
  'Watch Hours',
  'Rewatch Count',
  'Personal Rating',
  'Priority',
  'Date Finished',
  'Special Notes',
  'Age Rating',
  'Genres',
  'Country',
  'Poster URL',
  'Backdrop URL',
  'Created At',
]

const MAIN_WIDTHS = [
  { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 32 }, { wch: 10 },
  { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
  { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  { wch: 10 }, { wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 28 },
  { wch: 20 }, { wch: 48 }, { wch: 48 }, { wch: 20 },
]

const STATUS_ORDER: MediaStatus[] = ['completed', 'watching', 'planned', 'on_hold', 'dropped']
const STATUS_LABELS: Record<MediaStatus, string> = {
  completed: 'Completed',
  watching: 'Watching',
  planned: 'Planned',
  on_hold: 'On Hold',
  dropped: 'Dropped',
}

function countTable(
  entries: MediaEntry[],
  getValues: (entry: MediaEntry) => string[] | string | null | undefined,
  limit = 10
): TableRow[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const raw = getValues(entry)
    const values = Array.isArray(raw) ? raw : raw ? [raw] : []
    for (const value of values) {
      const key = value.trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
}

function statusTable(entries: MediaEntry[]): TableRow[] {
  return STATUS_ORDER.map((status) => [
    STATUS_LABELS[status],
    entries.filter((entry) => entry.status === status).length,
  ])
}

function mediaTypeTable(entries: MediaEntry[]): TableRow[] {
  return [
    ['Movies', entries.filter((entry) => getEffectiveMediaType(entry) === 'movie').length],
    ['Series', entries.filter((entry) => getEffectiveMediaType(entry) === 'series').length],
  ]
}

function summaryMetrics(entries: MediaEntry[]): [string, string | number][] {
  const movies = entries.filter((entry) => getEffectiveMediaType(entry) === 'movie')
  const series = entries.filter((entry) => getEffectiveMediaType(entry) === 'series')
  const rated = entries.filter((entry) => entry.personalRating != null)
  const avgRating = rated.length > 0
    ? rated.reduce((sum, entry) => sum + (entry.personalRating ?? 0), 0) / rated.length
    : null

  return [
    ['Export Date', new Date().toLocaleString()],
    ['Total Titles', entries.length],
    ['Total Movies', movies.length],
    ['Total Series', series.length],
    ['Average Rating', avgRating == null ? '' : Number(avgRating.toFixed(2))],
    ['Total Watch Hours', Number(calculateTotalWatchHours(entries).toFixed(2))],
  ]
}

function buildSummarySheet(workbook: XLSX.WorkBook, entries: MediaEntry[]) {
  const countries = countTable(entries, (entry) => entry.country, 10)
  const genres = countTable(entries, (entry) => entry.genres, 10)
  const statuses = statusTable(entries)
  const mediaTypes = mediaTypeTable(entries)
  const rows: unknown[][] = []

  rows[0] = ['MovieLogger Export Dashboard']
  rows[1] = []
  rows[2] = ['Metric', 'Value']
  summaryMetrics(entries).forEach((row, index) => { rows[3 + index] = row })

  rows[2][3] = 'Rank'
  rows[2][4] = 'Top Countries'
  rows[2][5] = 'Titles'
  countries.forEach(([label, count], index) => {
    rows[3 + index] = rows[3 + index] ?? []
    rows[3 + index][3] = index + 1
    rows[3 + index][4] = label
    rows[3 + index][5] = count
  })

  rows[2][7] = 'Rank'
  rows[2][8] = 'Top Genres'
  rows[2][9] = 'Titles'
  genres.forEach(([label, count], index) => {
    rows[3 + index] = rows[3 + index] ?? []
    rows[3 + index][7] = index + 1
    rows[3 + index][8] = label
    rows[3 + index][9] = count
  })

  rows[15] = []
  rows[16] = ['Status', 'Titles', '', 'Media Type', 'Titles']
  statuses.forEach(([label, count], index) => {
    rows[17 + index] = rows[17 + index] ?? []
    rows[17 + index][0] = label
    rows[17 + index][1] = count
  })
  mediaTypes.forEach(([label, count], index) => {
    rows[17 + index] = rows[17 + index] ?? []
    rows[17 + index][3] = label
    rows[17 + index][4] = count
  })

  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 22 }, { wch: 18 }, { wch: 4 }, { wch: 8 }, { wch: 24 },
    { wch: 10 }, { wch: 4 }, { wch: 8 }, { wch: 24 }, { wch: 10 },
  ]
  worksheet['!freeze'] = { xSplit: 0, ySplit: 3 }
  worksheet['!rows'] = Array.from({ length: 28 }, (_, index) => ({ hpt: index === 0 ? 28 : 22 }))
  applyBasicSheetStyle(worksheet, 23, [0, 2, 16])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MovieLogger Summary')
}

function applyBasicSheetStyle(worksheet: XLSX.WorkSheet, maxRow: number, headerRows: number[]) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1')
  for (let row = range.s.r; row <= Math.min(range.e.r, maxRow); row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
      if (!cell) continue
      const isHeader = headerRows.includes(row)
      cell.s = {
        font: isHeader ? { bold: true, color: { rgb: row === 0 ? 'FFFFFF' : '0F172A' } } : undefined,
        fill: isHeader
          ? { fgColor: { rgb: row === 0 ? '1E3A8A' : 'DBEAFE' } }
          : row > 0 && row % 2 === 1
            ? { fgColor: { rgb: 'F8FAFC' } }
            : undefined,
        alignment: {
          vertical: 'top',
          wrapText: true,
        },
      }
    }
  }
}

function styleMainWorksheet(worksheet: XLSX.WorkSheet, rows: ExportRow[]) {
  const lastColumn = XLSX.utils.encode_col(MAIN_HEADERS.length - 1)
  worksheet['!cols'] = MAIN_WIDTHS
  worksheet['!autofilter'] = { ref: `A1:${lastColumn}${Math.max(rows.length + 1, 1)}` }
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }
  worksheet['!rows'] = [
    { hpt: 24 },
    ...rows.map((row) => {
      const title = String(row.Title ?? '')
      const notes = String(row['Special Notes'] ?? '')
      return { hpt: title.length > 42 || notes.length > 80 ? 44 : 22 }
    }),
  ]

  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1')
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
      if (!cell) continue
      const header = MAIN_HEADERS[col]
      const isHeader = row === 0
      cell.s = {
        font: isHeader ? { bold: true, color: { rgb: 'FFFFFF' } } : undefined,
        fill: isHeader
          ? { fgColor: { rgb: '1E3A8A' } }
          : row % 2 === 0
            ? { fgColor: { rgb: 'F8FAFC' } }
            : undefined,
        alignment: {
          horizontal: isHeader ? 'center' : 'left',
          vertical: 'top',
          wrapText: isHeader || header === 'Title' || header === 'Special Notes',
        },
      }
    }
  }
}

function addMainSheet(workbook: XLSX.WorkBook, rows: ExportRow[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: MAIN_HEADERS as string[] })
  styleMainWorksheet(worksheet, rows)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MovieLogger')
}

function assertExportCompleteness(entries: MediaEntry[], rows: ExportRow[]) {
  const nonEmptyTitleRows = rows.filter((row) => String(row.Title ?? '').trim() !== '').length
  if (nonEmptyTitleRows !== entries.length) {
    throw new Error(
      `Export integrity check failed: expected ${entries.length} title rows, got ${nonEmptyTitleRows}`
    )
  }
}

// ---------------------------------------------------------------------------
// Minimal XLSX/ZIP patcher for Excel-compatible charts and panes.
// SheetJS CE writes data well but does not expose chart generation.
// This injects standard OOXML drawing/chart parts into the generated workbook.
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

interface ZipEntry {
  name: string
  data: Uint8Array
}

function crc32(bytes: Uint8Array): number {
  let crc = -1
  for (let j = 0; j < bytes.length; j++) {
    const byte = bytes[j]
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
    }
  }
  return (crc ^ -1) >>> 0
}

function pushBytes(out: number[], bytes: Uint8Array) {
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i])
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8)
}

function readU32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0
}

function writeU16(out: number[], value: number) {
  out.push(value & 255, (value >>> 8) & 255)
}

function writeU32(out: number[], value: number) {
  out.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255)
}

function findEndOfCentralDirectory(zip: Uint8Array): number {
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65558); i--) {
    if (readU32(zip, i) === 0x06054b50) return i
  }
  throw new Error('Invalid XLSX: end of central directory not found')
}

function unzipStoreEntries(zip: Uint8Array): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(zip)
  const entryCount = readU16(zip, eocd + 10)
  let cdOffset = readU32(zip, eocd + 16)
  const entries: ZipEntry[] = []

  for (let i = 0; i < entryCount; i++) {
    if (readU32(zip, cdOffset) !== 0x02014b50) throw new Error('Invalid XLSX central directory')
    const method = readU16(zip, cdOffset + 10)
    const compressedSize = readU32(zip, cdOffset + 20)
    const uncompressedSize = readU32(zip, cdOffset + 24)
    const fileNameLength = readU16(zip, cdOffset + 28)
    const extraLength = readU16(zip, cdOffset + 30)
    const commentLength = readU16(zip, cdOffset + 32)
    const localOffset = readU32(zip, cdOffset + 42)
    const name = textDecoder.decode(zip.slice(cdOffset + 46, cdOffset + 46 + fileNameLength))

    if (method !== 0) throw new Error('XLSX chart patcher expected uncompressed ZIP entries')
    const localNameLength = readU16(zip, localOffset + 26)
    const localExtraLength = readU16(zip, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = zip.slice(dataStart, dataStart + uncompressedSize)
    if (data.length !== compressedSize) throw new Error(`Invalid XLSX entry size: ${name}`)
    entries.push({ name, data })

    cdOffset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function zipStoreEntries(entries: ZipEntry[]): Uint8Array {
  const out: number[] = []
  const central: number[] = []

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name)
    const crc = crc32(entry.data)
    const localOffset = out.length

    writeU32(out, 0x04034b50)
    writeU16(out, 20)
    writeU16(out, 0)
    writeU16(out, 0)
    writeU16(out, 0)
    writeU16(out, 0)
    writeU32(out, crc)
    writeU32(out, entry.data.length)
    writeU32(out, entry.data.length)
    writeU16(out, nameBytes.length)
    writeU16(out, 0)
    pushBytes(out, nameBytes)
    pushBytes(out, entry.data)

    writeU32(central, 0x02014b50)
    writeU16(central, 20)
    writeU16(central, 20)
    writeU16(central, 0)
    writeU16(central, 0)
    writeU16(central, 0)
    writeU16(central, 0)
    writeU32(central, crc)
    writeU32(central, entry.data.length)
    writeU32(central, entry.data.length)
    writeU16(central, nameBytes.length)
    writeU16(central, 0)
    writeU16(central, 0)
    writeU16(central, 0)
    writeU16(central, 0)
    writeU32(central, 0)
    writeU32(central, localOffset)
    pushBytes(central, nameBytes)
  }

  const centralOffset = out.length
  for (let i = 0; i < central.length; i++) out.push(central[i])
  writeU32(out, 0x06054b50)
  writeU16(out, 0)
  writeU16(out, 0)
  writeU16(out, entries.length)
  writeU16(out, entries.length)
  writeU32(out, central.length)
  writeU32(out, centralOffset)
  writeU16(out, 0)

  return new Uint8Array(out)
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function pieChartXml(title: string, labelRange: string, valueRange: string, donut = false): string {
  const chartBody = donut
    ? `<c:doughnutChart><c:varyColors val="1"/><c:holeSize val="55"/>${seriesXml(labelRange, valueRange)}</c:doughnutChart>`
    : `<c:pieChart><c:varyColors val="1"/>${seriesXml(labelRange, valueRange)}</c:pieChart>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${xmlEscape(title)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>
    <c:plotArea><c:layout/>${chartBody}</c:plotArea>
    <c:legend><c:legendPos val="r"/><c:layout/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
  <c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>
</c:chartSpace>`
}

function seriesXml(labelRange: string, valueRange: string): string {
  return `<c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strRef><c:f>${labelRange}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${valueRange}</c:f></c:numRef></c:val><c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls></c:ser>`
}

function drawingXml(): string {
  const anchors = [
    { id: 1, name: 'Country Chart', fromCol: 0, fromRow: 25, toCol: 5, toRow: 42 },
    { id: 2, name: 'Genre Chart', fromCol: 6, fromRow: 25, toCol: 11, toRow: 42 },
    { id: 3, name: 'Status Chart', fromCol: 0, fromRow: 43, toCol: 5, toRow: 60 },
    { id: 4, name: 'Movies vs Series Chart', fromCol: 6, fromRow: 43, toCol: 11, toRow: 60 },
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors.map((a) => `<xdr:twoCellAnchor>
  <xdr:from><xdr:col>${a.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>${a.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
  <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${a.id}" name="${xmlEscape(a.name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId${a.id}"/></a:graphicData></a:graphic></xdr:graphicFrame>
  <xdr:clientData/>
</xdr:twoCellAnchor>`).join('\n')}
</xdr:wsDr>`
}

function drawingRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart4.xml"/>
</Relationships>`
}

function updateContentTypes(xml: string): string {
  let next = xml
  if (!next.includes('ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"')) {
    next = next.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>')
  }
  for (let i = 1; i <= 4; i++) {
    const part = `/xl/charts/chart${i}.xml`
    if (!next.includes(`PartName="${part}"`)) {
      next = next.replace('</Types>', `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
    }
  }
  return next
}

function ensureRelationshipNamespace(sheetXml: string): string {
  if (sheetXml.includes('xmlns:r=')) return sheetXml
  return sheetXml.replace(
    '<worksheet ',
    '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  )
}

function withFrozenPane(sheetXml: string, ySplit: number, topLeftCell: string): string {
  const viewXml = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${ySplit}" topLeftCell="${topLeftCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>`
  if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(sheetXml)) {
    return sheetXml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, viewXml)
  }
  if (sheetXml.includes('<sheetFormatPr')) {
    return sheetXml.replace('<sheetFormatPr', `${viewXml}<sheetFormatPr`)
  }
  return sheetXml.replace('<sheetData', `${viewXml}<sheetData`)
}

function addWorksheetDrawing(sheetXml: string): string {
  const withPane = ensureRelationshipNamespace(withFrozenPane(sheetXml, 3, 'A4'))
  if (withPane.includes('<drawing ')) return withPane
  return withPane.replace('</worksheet>', '<drawing r:id="rIdChartDrawing"/></worksheet>')
}

function upsertSheetRels(existing?: string): string {
  if (!existing) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdChartDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
  }
  if (existing.includes('Id="rIdChartDrawing"')) return existing
  return existing.replace('</Relationships>', '<Relationship Id="rIdChartDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>')
}

function upsert(entries: ZipEntry[], name: string, content: string) {
  const data = textEncoder.encode(content)
  const found = entries.find((entry) => entry.name === name)
  if (found) found.data = data
  else entries.push({ name, data })
}

function patchWorkbookXml(buffer: ArrayBuffer): Uint8Array {
  const entries = unzipStoreEntries(new Uint8Array(buffer))
  const findText = (name: string) => {
    const entry = entries.find((e) => e.name === name)
    return entry ? textDecoder.decode(entry.data) : undefined
  }

  const contentTypes = findText('[Content_Types].xml')
  const mainSheet = findText('xl/worksheets/sheet1.xml')
  const summarySheet = findText('xl/worksheets/sheet2.xml')
  if (!contentTypes || !summarySheet) return new Uint8Array(buffer)

  upsert(entries, '[Content_Types].xml', updateContentTypes(contentTypes))
  if (mainSheet) {
    upsert(entries, 'xl/worksheets/sheet1.xml', withFrozenPane(mainSheet, 1, 'A2'))
  }
  upsert(entries, 'xl/worksheets/sheet2.xml', addWorksheetDrawing(summarySheet))
  upsert(entries, 'xl/worksheets/_rels/sheet2.xml.rels', upsertSheetRels(findText('xl/worksheets/_rels/sheet2.xml.rels')))
  upsert(entries, 'xl/drawings/drawing1.xml', drawingXml())
  upsert(entries, 'xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml())

  upsert(entries, 'xl/charts/chart1.xml', pieChartXml('Top Countries', "'MovieLogger Summary'!$E$4:$E$13", "'MovieLogger Summary'!$F$4:$F$13", true))
  upsert(entries, 'xl/charts/chart2.xml', pieChartXml('Top Genres', "'MovieLogger Summary'!$I$4:$I$13", "'MovieLogger Summary'!$J$4:$J$13"))
  upsert(entries, 'xl/charts/chart3.xml', pieChartXml('Status Distribution', "'MovieLogger Summary'!$A$18:$A$22", "'MovieLogger Summary'!$B$18:$B$22"))
  upsert(entries, 'xl/charts/chart4.xml', pieChartXml('Movies vs Series', "'MovieLogger Summary'!$D$18:$D$19", "'MovieLogger Summary'!$E$18:$E$19", true))

  return zipStoreEntries(entries)
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportToExcel(entries: MediaEntry[], filename = 'movielogger_export'): void {
  const rows = entries.map(entryToRow)
  assertExportCompleteness(entries, rows)

  const workbook = XLSX.utils.book_new()
  addMainSheet(workbook, rows)
  buildSummarySheet(workbook, entries)

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: false,
    cellStyles: true,
  }) as ArrayBuffer
  const patched = patchWorkbookXml(buffer)
  downloadBytes(patched, `${filename}.xlsx`)
}

export function exportToCSV(entries: MediaEntry[], filename = 'movielogger_export'): void {
  const rows = entries.map(entryToRow)
  assertExportCompleteness(entries, rows)

  const csv = Papa.unparse(rows, { columns: MAIN_HEADERS as string[] })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
