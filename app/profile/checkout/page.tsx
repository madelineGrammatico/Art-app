import { auth } from '@/src/lib/auth/auth'
import { getUserAction } from '../../api/users/user.action'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card } from '@/src/components/ui/card'
import defaultImage from '@/public/rouge_gorge.png'
import { Separator } from "@/src/components/ui/separator"
import Link from 'next/link'
import { Button } from '@/src/components/ui/button'
import { prisma } from '@/src/lib/prisma'
import CheckoutButton from '@/src/components/checkout/CheckoutButton'

export default async function CheckoutPage() {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')
  
  // Récupérer les invoices PENDING de l'utilisateur
  const invoices = await prisma.invoice.findMany({
    where: {
      buyerId: userId,
      status: "PENDING"
    },
    include: {
      artwork: true
    },
    orderBy: {
      createdAt: "desc"
    }
  })

  // Convertir les Decimal en nombres
  const invoicesWithNumberPrice = invoices.map(invoice => ({
    ...invoice,
    amount: Number(invoice.amount),
    artwork: {
      ...invoice.artwork,
      price: Number(invoice.artwork.price)
    }
  }))

  const total = invoicesWithNumberPrice.reduce((sum, inv) => sum + inv.amount, 0)

  if (invoices.length === 0) {
    return (
      <main className="w-full flex-1 mx-auto max-w-5xl px-4 py-8">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Aucune commande en attente de paiement</p>
          <Link href="/profile/basket">
            <Button variant="outline">Retour au panier</Button>
          </Link>
        </Card>
      </main>
    )
  }

  return (
    <main className="w-full flex-1 mx-auto max-w-5xl px-4 py-8 flex flex-col gap-8 md:flex-row">
      {/* Colonne gauche : résumé du profil + navigation compte */}
      <section className="w-full md:w-1/3">
        <Card className="border bg-white shadow-sm rounded-2xl p-6 flex flex-col items-center space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">Mon profil</h1>
          <Image
            src={user.image && user.image !== 'NULL' ? user.image : defaultImage}
            alt="Avatar"
            width={64}
            height={64}
            className="w-16 h-16 rounded-full my-4 object-cover"
          />
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Separator className="my-2" />
          <nav
            aria-label="Navigation du compte"
            className="w-full space-y-2 text-sm"
          >
            <Link 
              href="/profile"
              className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition block"
            >
              Mes informations
            </Link>
            <Link 
              href="/profile/addresses"
              className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition block"
            >
              Mes adresses
            </Link>
            <button className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition">
              Mes commandes
            </button>
            <Link
              href="/profile/basket"
              className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition block"
            >
              Mon panier
            </Link>
          </nav>
        </Card>
      </section>

      {/* Colonne droite : détails de la commande */}
      <section className="w-full md:flex-1">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            Paiement de la commande
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Vérifiez les détails de votre commande avant de procéder au paiement.
          </p>
        </div>
        <Separator className="mb-4" />

        <div className="flex flex-col gap-4">
          {invoicesWithNumberPrice.map((invoice) => (
            <Card key={invoice.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{invoice.artwork.title}</h3>
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

          <Card className="p-6 bg-slate-900">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center text-white">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-2xl font-bold">{total.toFixed(2)} €</span>
              </div>
              <Separator className="bg-slate-700" />
              <CheckoutButton />
              <Link href="/profile/basket">
                <Button variant="outline" className="w-full">
                  Retour au panier
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </main>
  )
}
