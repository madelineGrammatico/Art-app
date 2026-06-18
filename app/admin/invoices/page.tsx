import React from "react"
import Link from "next/link"
import { Card, CardContent } from "@/src/components/ui/card"
import { buttonVariants } from "@/src/components/ui/button"
import { prisma } from "@/src/lib/prisma"
import { auth } from "@/src/lib/auth/auth"
import { hasPermissions } from "@/src/lib/auth/permissions/permissions"
import { UserRole } from "@prisma/client"
import { RefundInvoiceButton } from "./refundInvoiceButton"
import { ArchiveInvoiceButton } from "./archiveInvoiceButton"

const eur = (n: number) => `${n.toFixed(2)} €`
const day = (d: Date) => d.toISOString().slice(0, 10)

export default async function Page() {
  const session = await auth()
  const role = session?.user?.role as UserRole

  // Toutes les factures (ventes + avoirs), archivées comprises (vue de gestion/audit).
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    include: {
      lineItems: true,
      creditNotes: { select: { id: true, number: true } },
    },
  })

  return (
    <Card className="w-full rounded-2xl">
      <CardContent className="flex w-full flex-col gap-4 bg-slate-400 p-6">
        {invoices.length === 0 && <p>Aucune facture.</p>}

        {invoices.map((invoice) => {
          const isSale = invoice.type === "SALE"
          const isArchived = invoice.archivedAt !== null
          const isRefunded = invoice.creditNotes.length > 0
          const total = Number(invoice.totalTTC)

          return (
            <Card className="flex items-start gap-4 p-4" key={invoice.id}>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{invoice.number}</h2>
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">
                    {isSale ? "Facture" : "Avoir"}
                  </span>
                  {isArchived && (
                    <span className="rounded bg-slate-500 px-2 py-0.5 text-xs text-white">
                      Archivée
                    </span>
                  )}
                  {isSale && isRefunded && (
                    <span className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white">
                      Avoir(s) émis
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
                {/* Remboursement : seulement une facture de vente, non archivée, pas encore créditée. */}
                {hasPermissions(role, "refund:invoice") &&
                  isSale &&
                  !isArchived &&
                  !isRefunded && <RefundInvoiceButton invoiceId={invoice.id} />}

                {hasPermissions(role, "delete:invoice") && !isArchived && (
                  <ArchiveInvoiceButton invoiceId={invoice.id} />
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
