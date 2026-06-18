import React from "react"
import Link from "next/link"
import { Card, CardContent } from "@/src/components/ui/card"
import { buttonVariants } from "@/src/components/ui/button"
import { prisma } from "@/src/lib/prisma"
import { auth } from "@/src/lib/auth/auth"
import { hasPermissions } from "@/src/lib/auth/permissions/permissions"
import { UserRole } from "@prisma/client"
import { RefundInvoicePanel } from "./refundInvoicePanel"

const eur = (n: number) => `${n.toFixed(2)} €`
const day = (d: Date) => d.toISOString().slice(0, 10)

export default async function Page() {
  const session = await auth()
  const role = session?.user?.role as UserRole

  // Toutes les factures (ventes + avoirs) — conservées en permanence (10 ans).
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    include: {
      lineItems: true,
      // lineItems des avoirs → pour connaître les œuvres déjà créditées (remb. partiels).
      creditNotes: { select: { id: true, number: true, lineItems: { select: { artworkId: true } } } },
    },
  })

  return (
    <Card className="w-full rounded-2xl">
      <CardContent className="flex w-full flex-col gap-4 bg-slate-400 p-6">
        {invoices.length === 0 && <p>Aucune facture.</p>}

        {invoices.map((invoice) => {
          const isSale = invoice.type === "SALE"
          const isRefunded = invoice.creditNotes.length > 0
          const total = Number(invoice.totalTTC)

          // Œuvres déjà créditées par un avoir → exclues des lignes remboursables.
          const creditedArtworkIds = new Set(
            invoice.creditNotes.flatMap((cn) => cn.lineItems.map((l) => l.artworkId))
          )
          const refundableLines = invoice.lineItems
            .filter((l) => !creditedArtworkIds.has(l.artworkId))
            .map((l) => ({ artworkId: l.artworkId, label: l.label, lineTTC: Number(l.lineTTC) }))
          const fullyRefunded = isSale && isRefunded && refundableLines.length === 0

          return (
            <Card className="flex items-start gap-4 p-4" key={invoice.id}>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{invoice.number}</h2>
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">
                    {isSale ? "Facture" : "Avoir"}
                  </span>
                  {isSale && isRefunded && (
                    <span className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white">
                      {fullyRefunded ? "Remboursée" : "Remb. partiel"}
                    </span>
                  )}
                </div>
                <p className="text-sm">
                  {invoice.buyerName} — {day(invoice.saleDate)}
                </p>
                <p className="text-sm">
                  Total : <strong>{eur(total)}</strong> ({invoice.lineItems.length} ligne
                  {invoice.lineItems.length > 1 ? "s" : ""})
                </p>
                {isSale && isRefunded && (
                  <p className="text-xs text-slate-700">
                    Avoirs : {invoice.creditNotes.map((cn) => cn.number).join(", ")}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                {/* Remboursement (total ou partiel) : vente avec au moins une œuvre
                    encore remboursable (non déjà créditée). */}
                {hasPermissions(role, "refund:invoice") &&
                  isSale &&
                  refundableLines.length > 0 && (
                    <RefundInvoicePanel invoiceId={invoice.id} lines={refundableLines} />
                  )}
              </div>
            </Card>
          )
        })}

        <Link href="/admin" className={buttonVariants({ size: "sm", variant: "outline" })}>
          ← Retour aux œuvres
        </Link>
      </CardContent>
    </Card>
  )
}
