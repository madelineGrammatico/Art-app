"use client"

import { Button } from "@/src/components/ui/button"
import { useState, useTransition } from "react"
import { refundSaleAction } from "@/app/api/invoices/invoice.action"
import { useRouter } from "next/navigation"

type RefundableLine = { artworkId: string; label: string; lineTTC: number }

const eur = (n: number) => `${n.toFixed(2)} €`

// Remboursement total OU partiel : l'admin coche les œuvres à rembourser.
// `lines` ne contient que les œuvres ENCORE remboursables (non déjà créditées) —
// la page filtre en amont, donc la sélection ne peut pas viser un avoir existant.
// Confirmation en deux temps (geste irréversible : avoir + remise en vente + email).
export function RefundInvoicePanel({
  invoiceId,
  lines,
}: {
  invoiceId: string
  lines: RefundableLine[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(() => lines.map((l) => l.artworkId))
  const [isConfirm, setIsConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const toggle = (id: string) => {
    setIsConfirm(false)
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectedTotal = lines
    .filter((l) => selected.includes(l.artworkId))
    .reduce((s, l) => s + l.lineTTC, 0)

  const handleRefund = () => {
    setError(null)
    startTransition(async () => {
      const res = await refundSaleAction({ invoiceId, artworkIds: selected })
      if (res && "error" in res) {
        setError(res.error ?? "Une erreur est survenue")
        setIsConfirm(false)
        return
      }
      // Reset : après un remboursement partiel le composant reste monté (il reste des
      // lignes remboursables) → sans reset, l'état (sélection, confirmation) serait périmé.
      setOpen(false)
      setIsConfirm(false)
      setSelected([])
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Rembourser…
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2 rounded border bg-white p-3">
      <p className="text-xs font-medium">Œuvres à rembourser</p>
      <div className="flex flex-col gap-1">
        {lines.map((l) => (
          <label key={l.artworkId} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(l.artworkId)}
              onChange={() => toggle(l.artworkId)}
              disabled={isPending}
            />
            <span>
              {l.label} — {eur(l.lineTTC)}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs">
        Total sélectionné : <strong>{eur(selectedTotal)}</strong>
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setOpen(false)
            setIsConfirm(false)
            setError(null)
          }}
        >
          Annuler
        </Button>
        <Button
          size="sm"
          variant={isConfirm ? "destructive" : "outline"}
          disabled={isPending || selected.length === 0}
          onClick={() => {
            if (isConfirm) handleRefund()
            else setIsConfirm(true)
          }}
        >
          {isPending
            ? "Remboursement…"
            : isConfirm
              ? "Confirmer le remboursement"
              : "Rembourser la sélection"}
        </Button>
      </div>
      {error && <p className="max-w-[220px] text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
