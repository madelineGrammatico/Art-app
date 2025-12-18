import { auth } from '@/src/lib/auth/auth'
import { getUserAction } from '../../api/users/user.action'
import { getBasketAction } from '@/app/api/basket/basket.action'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card } from '@/src/components/ui/card'
import defaultImage from '@/public/rouge_gorge.png'
import { Separator } from "@/src/components/ui/separator"
import Link from 'next/link'
import BasketItemCard from '@/src/components/basket/BasketItemCard'
import { Button } from '@/src/components/ui/button'
import ClearBasketButton from '@/src/components/basket/ClearBasketButton'
import ConfirmBasketButton from '@/src/components/basket/ConfirmBasketButton'

export default async function BasketPage() {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')
  
  const basketResult = await getBasketAction(userId)
  
  if (basketResult.error) {
    return (
      <main className="w-full flex-1 mx-auto max-w-5xl px-4 py-8">
        <Card className="p-6">
          <p className="text-destructive">{basketResult.error}</p>
        </Card>
      </main>
    )
  }

  const { basket, removedItemsCount = 0 } = basketResult
  
  // Convertir les Decimal en nombres pour les composants clients
  type BasketItemType = NonNullable<typeof basket>['items'][number]
  const items = (basket?.items || []).map((item: BasketItemType) => ({
    ...item,
    artwork: {
      ...item.artwork,
      price: Number(item.artwork.price)
    }
  }))
  
  type BasketItemWithNumberPrice = typeof items[number]

  const total = items.reduce((sum: number, item: BasketItemWithNumberPrice) => {
    const price = item.artwork.price
    return sum + price
  }, 0)

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
              className="w-full text-left px-3 py-2 rounded-md bg-slate-100 font-medium transition block"
            >
              Mon panier
            </Link>
          </nav>
        </Card>
      </section>

      {/* Colonne droite : panier */}
      <section className="w-full md:flex-1">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            Mon panier
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez les articles dans votre panier.
          </p>
        </div>
        <Separator className="mb-4" />

        {removedItemsCount > 0 && (
          <Card className="mb-4 p-4 bg-yellow-50 border-yellow-200">
            <p className="text-sm text-yellow-800">
              {removedItemsCount} article{removedItemsCount > 1 ? 's' : ''} {removedItemsCount > 1 ? 'ont été retirés' : 'a été retiré'} de votre panier car {removedItemsCount > 1 ? 'les oeuvres ont été vendues' : "l'oeuvre a été vendue"} entre deux connexions.
            </p>
          </Card>
        )}

        {items.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Votre panier est vide</p>
            <Link href="/">
              <Button variant="outline">Continuer vos achats</Button>
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              {items.map((item: BasketItemWithNumberPrice) => (
                <BasketItemCard key={item.id} item={item} />
              ))}
            </div>

            <Card className="p-6 bg-slate-900 ">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center text-white">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-2xl font-bold">{total.toFixed(2)} €</span>
                </div>
                <Separator className="bg-slate-700" />
                <ConfirmBasketButton userId={userId} />
                <div className="flex gap-2">
                  <ClearBasketButton userId={userId} />
                  <Link href="/" className="flex-1">
                    <Button variant="outline" className="w-full">
                      Continuer vos achats
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        )}
      </section>
    </main>
  )
}
