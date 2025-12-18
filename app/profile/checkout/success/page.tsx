import { auth } from '@/src/lib/auth/auth'
import { getUserAction } from '../../../api/users/user.action'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card } from '@/src/components/ui/card'
import defaultImage from '@/public/rouge_gorge.png'
import { Separator } from "@/src/components/ui/separator"
import Link from 'next/link'
import { Button } from '@/src/components/ui/button'
import { prisma } from '@/src/lib/prisma'

type PageProps = {
  searchParams: Promise<{ session_id?: string }>
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')

  const params = await searchParams
  const sessionId = params.session_id

  // Récupérer les invoices payées récemment (dernières 5 minutes)
  const recentPaidInvoices = await prisma.invoice.findMany({
    where: {
      buyerId: userId,
      status: "PAID",
      ...(sessionId ? { stripeSessionId: sessionId } : {}),
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000) // Dernières 5 minutes
      }
    },
    include: {
      artwork: true
    },
    orderBy: {
      createdAt: "desc"
    }
  })

  // Convertir les Decimal en nombres
  const invoicesWithNumberPrice = recentPaidInvoices.map(invoice => ({
    ...invoice,
    amount: Number(invoice.amount),
    artwork: {
      ...invoice.artwork,
      price: Number(invoice.artwork.price)
    }
  }))

  const total = invoicesWithNumberPrice.reduce((sum, inv) => sum + inv.amount, 0)

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

      {/* Colonne droite : confirmation de paiement */}
      <section className="w-full md:flex-1">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight text-green-600">
            ✓ Paiement réussi
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Votre commande a été confirmée avec succès.
          </p>
        </div>
        <Separator className="mb-4" />

        {invoicesWithNumberPrice.length > 0 ? (
          <div className="flex flex-col gap-4">
            <Card className="p-6 bg-green-50 border-green-200">
              <p className="text-green-800 font-semibold mb-2">
                Merci pour votre achat !
              </p>
              <p className="text-sm text-green-700">
                Vous avez acheté {invoicesWithNumberPrice.length} oeuvre{invoicesWithNumberPrice.length > 1 ? 's' : ''} pour un total de {total.toFixed(2)} €.
              </p>
            </Card>

            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-semibold">Oeuvres achetées :</h3>
              {invoicesWithNumberPrice.map((invoice) => (
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
                <Button className="w-full">
                  Continuer vos achats
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Aucune commande récente trouvée. Le paiement peut prendre quelques instants à être traité.
            </p>
            <Link href="/profile">
              <Button variant="outline">Retour au profil</Button>
            </Link>
          </Card>
        )}
      </section>
    </main>
  )
}
