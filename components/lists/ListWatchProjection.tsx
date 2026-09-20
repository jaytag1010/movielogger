'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, CheckSquare, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProjectionEntry, ProjectionMode } from '@/utils/listProjection'
import { calculateListProjection } from '@/utils/listProjection'
import { getDisplayTitle } from '@/utils/formatters'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const PAGE_SIZE = 50

function keyFor(entry: ProjectionEntry): string {
  return 'internalId' in entry ? entry.id || entry.internalId : entry.publicId
}

export function ListWatchProjection({ entries, owner, open, onOpenChange }: { entries: ProjectionEntry[]; owner: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<ProjectionMode>(owner ? 'remaining' : 'full')
  const [speed, setSpeed] = useState(1)
  const [page, setPage] = useState(1)
  useEffect(() => { if (!open) { setSelectedIds(new Set()); setPage(1); setMode(owner ? 'remaining' : 'full'); setSpeed(1) } }, [open, owner])
  const selected = useMemo(() => entries.filter((entry) => selectedIds.has(keyFor(entry))), [entries, selectedIds])
  const result = useMemo(() => calculateListProjection(selected, owner ? mode : 'full', speed), [selected, owner, mode, speed])
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const visible = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  function toggle(id: string) { setSelectedIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next }) }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-300" />Watch Time Projection</DialogTitle><DialogDescription>Select titles from the complete list, then choose a watch speed.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set(entries.map(keyFor)))}>Select All ({entries.length})</Button><Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Deselect All</Button><span className="self-center text-xs text-white/45">{selectedIds.size} selected</span></div>
      {owner && <div><p className="mb-2 text-xs font-semibold uppercase text-white/40">Projection Mode</p><div className="grid gap-2 sm:grid-cols-2"><button onClick={() => setMode('remaining')} className={`rounded-lg border p-3 text-left ${mode === 'remaining' ? 'border-blue-500/60 bg-blue-500/10' : 'border-white/10 bg-white/[0.025]'}`}><p className="text-sm font-medium">Remaining Watch Time</p><p className="mt-1 text-xs text-white/40">Accounts for episodes you have already watched.</p></button><button onClick={() => setMode('full')} className={`rounded-lg border p-3 text-left ${mode === 'full' ? 'border-blue-500/60 bg-blue-500/10' : 'border-white/10 bg-white/[0.025]'}`}><p className="text-sm font-medium">Full Watch Time</p><p className="mt-1 text-xs text-white/40">Calculates every selected title from beginning to end.</p></button></div></div>}
      <div className="grid grid-cols-2 gap-3"><div><p className="mb-1 text-xs text-white/40">Watch Speed</p><Select value={String(speed)} onValueChange={(value) => setSpeed(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SPEEDS.map((value) => <SelectItem key={value} value={String(value)}>{value}×</SelectItem>)}</SelectContent></Select></div><div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-white/40">Projected Watch Time</p><p className="mt-1 text-xl font-semibold text-white">{result.projectedHours.toFixed(2)} h</p></div></div>
      <div className="grid grid-cols-3 gap-2 text-center"><Stat label="Included" value={result.includedCount} /><Stat label="Episodes" value={result.totalEpisodes} /><Stat label="Base Runtime" value={`${result.baseHours.toFixed(2)} h`} /></div>
      {result.excludedCount > 0 && <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">{result.excludedCount} selected title{result.excludedCount === 1 ? '' : 's'} could not be included because runtime information is unavailable.</p>}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">{visible.map((entry) => { const id = keyFor(entry); const checked = selectedIds.has(id); return <button key={id} onClick={() => toggle(id)} className="flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left text-sm last:border-0 hover:bg-white/5">{checked ? <CheckSquare className="h-4 w-4 text-blue-300" /> : <Square className="h-4 w-4 text-white/25" />}<span className="truncate">{getDisplayTitle(entry)}</span></button> })}</div>
      {pageCount > 1 && <div className="flex items-center justify-center gap-3"><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-white/40">Page {page} of {pageCount}</span><Button size="sm" variant="ghost" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
    </div>
  </DialogContent></Dialog>
}

function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg bg-white/[0.035] p-2"><p className="font-semibold text-white">{value}</p><p className="text-[10px] uppercase text-white/35">{label}</p></div> }
