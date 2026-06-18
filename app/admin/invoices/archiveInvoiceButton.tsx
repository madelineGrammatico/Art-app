"use client"

import { Button } from "@/src/components/ui/button"
import { useState, useTransition } from "react"
import { archiveInvoiceAction } from "@/app/api/invoices/invoice.action"
import { useRouter } from "next/navigation"

// Archivage (soft-delete) : retire la facture des vues actives sans la détruire
// (conservation légale 10 ans). Confirmation en deux temps.
export function ArchiveInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [isConfirm, setIsConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleArchive = () => {
    setError(null)
    startTransition(async () => {
      const res = await archiveInvoiceAction(invoiceId)
      if (res && "error" in res) {
        setError(res.error ?? "Une erreur est survenue")
        setIsConfirm(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={isConfirm ? "destructive" : "outline"}
        disabled={isPending}
        onClick={() => {
          if (isConfirm) handleArchive()
          else setIsConfirm(true)
        }}
      >
        {isPending ? "Archivage…" : isConfirm ? "Confirmer l'archivage" : "Archiver"}
      </Button>
      {error && <p className="max-w-[220px] text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
