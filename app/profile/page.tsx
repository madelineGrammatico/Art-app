import { auth } from '@/src/lib/auth/auth'
import { getUserAction } from '../api/users/user.action'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card } from '@/src/components/ui/card'
import defaultImage from '@/public/rouge_gorge.png'
import { Separator } from "@/src/components/ui/separator"
import ProfileSectionsWrapper from '@/src/components/profile/ProfileSectionsWrapper'

export default async function Page() {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')
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
            <button className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition">
              Mon compte
            </button>
            <button className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition">
              Mes commandes
            </button>
            <button className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition">
              Mon panier
            </button>
          </nav>
        </Card>
      </section>

      {/* Colonne droite : informations détaillées + formulaire d’édition */}
      <section className="w-full md:flex-1">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            Mes informations personnelles
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez les informations visibles sur votre compte.
          </p>
        </div>
        <Separator className="mb-4" />

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 flex flex-col items-start gap-3">
            <Image
              src={user.image && user.image !== 'NULL' ? user.image : defaultImage}
              alt="Avatar"
              width={128}
              height={128}
              className="w-32 h-32 rounded-full object-cover"
            />
            <div className="space-y-1">
              <p className="text-base font-semibold">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            <ProfileSectionsWrapper user={user} />
          </div>
        </div>
      </section>
    </main>
  )
}