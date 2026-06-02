'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { CheckCircle, Star } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MediaEntry } from '@/types/media'
import { getDisplayTitle } from '@/utils/formatters'

// ── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  personalRating: z.coerce
    .number()
    .min(0, 'Min 0')
    .max(10, 'Max 10')
    .nullable()
    .optional(),
  dateFinished: z.string().min(1, 'Date is required'),
  specialNotes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompletionDetails {
  personalRating: number | null
  dateFinished: string       // 'yyyy-MM-dd'
  specialNotes: string | null
}

interface CompletionDetailsModalProps {
  entry: MediaEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the user submits the form — parent handles the async save. */
  onConfirm: (details: CompletionDetails) => void
  loading?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export function CompletionDetailsModal({
  entry,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: CompletionDetailsModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Pre-populate with existing values whenever the dialog opens for an entry
  useEffect(() => {
    if (!entry || !open) return
    reset({
      personalRating: entry.personalRating ?? undefined,
      dateFinished: entry.dateFinished
        ? format(entry.dateFinished.toDate(), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd'),
      specialNotes: entry.specialNotes ?? '',
    })
  }, [entry, open, reset])

  function onSubmit(data: FormData) {
    onConfirm({
      personalRating: data.personalRating ?? null,
      dateFinished: data.dateFinished,
      specialNotes: data.specialNotes || null,
    })
  }

  if (!entry) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            Completion Details
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-white/40 -mt-1 leading-snug line-clamp-1">
          {getDisplayTitle(entry)}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-1">

          {/* Personal Rating */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              Personal Rating
              <span className="text-white/30 font-normal">(0–10, optional)</span>
            </Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.01}
              placeholder="8.25"
              {...register('personalRating')}
            />
            {errors.personalRating && (
              <p className="text-xs text-red-400">{errors.personalRating.message}</p>
            )}
          </div>

          {/* Date Finished */}
          <div className="space-y-1.5">
            <Label>Date Finished</Label>
            <Input
              type="date"
              className="text-white/70"
              {...register('dateFinished')}
            />
            {errors.dateFinished && (
              <p className="text-xs text-red-400">{errors.dateFinished.message}</p>
            )}
          </div>

          {/* Special Notes */}
          <div className="space-y-1.5">
            <Label>
              Special Notes
              <span className="text-white/30 font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              placeholder="Any thoughts, review, or notes..."
              rows={3}
              {...register('specialNotes')}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </div>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save &amp; Complete
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
