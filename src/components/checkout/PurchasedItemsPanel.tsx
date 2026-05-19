import { Card } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import Link from "next/link"

export type PurchasedInvoice = {
  id: string
  amount: number
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
  const total = invoices.reduce((sum, inv) => sum + inv.amount, 0)

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6 bg-green-50 border-green-200">
        <p className="text-green-800 font-semibold mb-2">Merci pour votre achat !</p>
        <p className="text-sm text-green-700">
          Vous avez acheté {invoices.length} oeuvre{invoices.length > 1 ? "s" : ""} pour un total de{" "}
          {total.toFixed(2)} €.
        </p>
      </Card>

      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Oeuvres achetées :</h3>
        {invoices.map((invoice) => (
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
