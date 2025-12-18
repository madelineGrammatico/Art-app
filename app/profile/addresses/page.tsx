import { auth } from '@/src/lib/auth/auth'
import { getUserAddressesAction, getUserAction } from '../../api/users/user.action'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card } from '@/src/components/ui/card'
import defaultImage from '@/public/rouge_gorge.png'
import { Separator } from "@/src/components/ui/separator"
import Link from 'next/link'
import AddressSection from '@/src/components/profile/AddressSection'

export default async function AddressesPage() {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')
  
  const addresses = await getUserAddressesAction(userId).catch(() => [])
  
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
              className="w-full text-left px-3 py-2 rounded-md bg-slate-100 font-medium transition block"
            >
              Mes adresses
            </Link>
            <button className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition">
              Mes commandes
            </button>
            <button className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition">
              Mon panier
            </button>
          </nav>
        </Card>
      </section>

      {/* Colonne droite : gestion des adresses */}
      <section className="w-full md:flex-1">
        <div className="mb-4 text-white">
          <h2 className="text-2xl font-bold tracking-tight">
            Mes adresses
          </h2>
          <p className="text-sm mt-1">
            Gérez vos adresses de facturation et de livraison.
          </p>
        </div>
        <Separator className="mb-4" />

        <div className="flex flex-col gap-4">
          <AddressSection userId={userId} initialAddresses={addresses} />
        </div>
      </section>
    </main>
  )
}
