'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileSpreadsheet, X, CheckCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ImportDropzoneProps {
  onFileParsed: (file: File) => void
  loading?: boolean
}

export function ImportDropzone({ onFileParsed, loading }: ImportDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (f: File) => {
      const ext = f.name.toLowerCase().split('.').pop()
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        setError('Please upload an .xlsx, .xls, or .csv file')
        return
      }
      setError(null)
      setFile(f)
      onFileParsed(f)
    },
    [onFileParsed]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) handleFile(dropped)
    },
    [handleFile]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) handleFile(selected)
  }

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200',
          dragging
            ? 'border-blue-500 bg-blue-500/10'
            : file
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/8'
        )}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={loading}
        />

        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-white">{file.name}</p>
                <p className="text-sm text-white/40">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); setError(null) }}
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.div
                animate={dragging ? { scale: 1.1 } : { scale: 1 }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 flex items-center justify-center"
              >
                {dragging ? (
                  <Upload className="w-7 h-7 text-blue-400" />
                ) : (
                  <FileSpreadsheet className="w-7 h-7 text-white/40" />
                )}
              </motion.div>
              <div>
                <p className="text-white font-medium">
                  {dragging ? 'Drop your file here' : 'Drop or click to upload'}
                </p>
                <p className="text-sm text-white/40 mt-0.5">Supports .xlsx, .xls, .csv</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-400"
        >
          {error}
        </motion.p>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white/40 space-y-1">
        <p className="font-medium text-white/60">Expected columns:</p>
        <p>Title, Type, Status, Year Made, Total Episodes, Episode Duration, Watch Hours, Personal Rating, Age Rating, Genres, Country, Date Finished, Special Notes, TMDB ID</p>
        <p className="text-white/30">Flexible column name matching — alternatives like "Movie Title", "Release Year" etc. are supported.</p>
      </div>
    </div>
  )
}
