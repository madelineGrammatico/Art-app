import { Card } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import Link from "next/link"

export type PurchasedInvoice = {
  id: string
  amount: number
  status: "PAID" | "REFUNDED"
  artwork: {
    id: string
    title: string
    price: number
  }
}

interface Props {
  invoices: PurchasedInvoice[]
}

export default function PurchasedItemsPanel({ invoices }: Props) {
  const paid = invoices.filter((i) => i.status === "PAID")
  const refunded = invoices.filter((i) => i.status === "REFUNDED")
  const paidTotal = paid.reduce((sum, i) => sum + i.amount, 0)
  const refundedTotal = refunded.reduce((sum, i) => sum + i.amount, 0)

  const allPaid = refunded.length === 0
  const allRefunded = paid.length === 0

  return (
    <div className="flex flex-col gap-4">
      {allPaid && (
        <Card className="p-6 bg-green-50 border-green-200">
          <p className="text-green-800 font-semibold mb-2">Merci pour votre achat !</p>
          <p className="text-sm text-green-700">
            Vous avez acheté {paid.length} oeuvre{paid.length > 1 ? "s" : ""} pour un total de{" "}
            {paidTotal.toFixed(2)} €.
          </p>
        </Card>
      )}

      {allRefunded && (
        <Card className="p-6 bg-amber-50 border-amber-200">
          <p className="text-amber-800 font-semibold mb-2">Commande non honorée</p>
          <p className="text-sm text-amber-700">
            Désolés, {refunded.length === 1 ? "l'oeuvre choisie n'était plus disponible" : "les oeuvres choisies n'étaient plus disponibles"} au moment du paiement.
            Vous avez été intégralement remboursé{refunded.length > 1 ? "" : ""} ({refundedTotal.toFixed(2)} €).
          </p>
        </Card>
      )}

      {!allPaid && !allRefunded && (
        <Card className="p-6 bg-amber-50 border-amber-200">
          <p className="text-amber-800 font-semibold mb-2">Commande partiellement honorée</p>
          <p className="text-sm text-amber-700">
            {paid.length} oeuvre{paid.length > 1 ? "s acquises" : " acquise"} pour {paidTotal.toFixed(2)} €.
            {" "}
            {refunded.length} oeuvre{refunded.length > 1 ? "s n'étaient plus disponibles" : " n'était plus disponible"} et {refunded.length > 1 ? "ont été remboursées" : "a été remboursée"} ({refundedTotal.toFixed(2)} €).
          </p>
        </Card>
      )}

      {paid.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">
            {allPaid ? "Oeuvres achetées :" : "Oeuvres acquises :"}
          </h3>
          {paid.map((invoice) => (
            <Card key={invoice.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold">{invoice.artwork.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    Prix : {invoice.amount.toFixed(2)} €
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{invoice.amount.toFixed(2)} €</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {refunded.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-muted-foreground">
            Remboursées :
          </h3>
          {refunded.map((invoice) => (
            <Card key={invoice.id} className="p-4 bg-slate-50 border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-muted-foreground">{invoice.artwork.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    Remboursé : {invoice.amount.toFixed(2)} €
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-muted-foreground line-through">
                    {invoice.amount.toFixed(2)} €
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Link href="/profile" className="flex-1">
          <Button variant="outline" className="w-full">
            Retour au profil
          </Button>
        </Link>
        <Link href="/" className="flex-1">
          <Button className="w-full">Continuer vos achats</Button>
        </Link>
      </div>
    </div>
  )
}
