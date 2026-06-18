"use client"

import { Button } from "@/src/components/ui/button"
import { useState, useTransition } from "react"
import { refundSaleAction } from "@/app/api/invoices/invoice.action"
import { useRouter } from "next/navigation"

// Remboursement total de la facture (avoir + remise en vente + email).
// Le remboursement partiel (par œuvre) est possible côté action (artworkIds),
// pas encore exposé ici. Confirmation en deux temps (geste irréversible).
export function RefundInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [isConfirm, setIsConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleRefund = () => {
    setError(null)
    startTransition(async () => {
      const res = await refundSaleAction({ invoiceId })
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
          if (isConfirm) handleRefund()
          else setIsConfirm(true)
        }}
      >
        {isPending
          ? "Remboursement…"
          : isConfirm
            ? "Confirmer le remboursement"
            : "Rembourser"}
      </Button>
      {error && <p className="max-w-[220px] text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
