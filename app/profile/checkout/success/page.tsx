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
import PurchasedItemsPanel from '@/src/components/checkout/PurchasedItemsPanel'
import SuccessPaymentPolling from '@/src/components/checkout/SuccessPaymentPolling'

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

  // Récupérer les invoices traitées récemment (PAID ou REFUNDED, dernières 5 minutes)
  const recentInvoices = await prisma.invoice.findMany({
    where: {
      buyerId: userId,
      status: { in: ["PAID", "REFUNDED"] },
      ...(sessionId ? { stripeSessionId: sessionId } : {}),
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000)
      }
    },
    include: {
      artwork: true
    },
    orderBy: {
      createdAt: "desc"
    }
  })

  const invoicesWithNumberPrice = recentInvoices.map(invoice => ({
    id: invoice.id,
    amount: Number(invoice.amount),
    status: invoice.status as "PAID" | "REFUNDED",
    artwork: {
      id: invoice.artwork.id,
      title: invoice.artwork.title,
      price: Number(invoice.artwork.price),
    },
  }))

  const hasAnyInvoice = invoicesWithNumberPrice.length > 0
  const allPaid = hasAnyInvoice && invoicesWithNumberPrice.every(i => i.status === "PAID")
  const allRefunded = hasAnyInvoice && invoicesWithNumberPrice.every(i => i.status === "REFUNDED")
  const mixed = hasAnyInvoice && !allPaid && !allRefunded

  const headerTitle = allPaid
    ? "✓ Paiement réussi"
    : allRefunded
    ? "Commande non honorée"
    : mixed
    ? "Commande partiellement honorée"
    : "Confirmation de votre commande"

  const headerSubtitle = allPaid
    ? "Votre commande a été confirmée avec succès."
    : allRefunded
    ? "Aucune oeuvre n'a pu être livrée — paiement intégralement remboursé."
    : mixed
    ? "Une partie de votre commande n'a pas pu être livrée."
    : "Traitement de votre paiement en cours."

  const headerColorClass = allPaid
    ? "text-green-600"
    : allRefunded || mixed
    ? "text-amber-700"
    : ""

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
          <h2 className={`text-2xl font-bold tracking-tight ${headerColorClass}`}>
            {headerTitle}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {headerSubtitle}
          </p>
        </div>
        <Separator className="mb-4" />

        {invoicesWithNumberPrice.length > 0 ? (
          <PurchasedItemsPanel invoices={invoicesWithNumberPrice} />
        ) : sessionId ? (
          <SuccessPaymentPolling sessionId={sessionId} />
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Aucune commande récente trouvée.
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
