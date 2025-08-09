import { auth } from '@/src/lib/auth/auth'
import { getUserAction } from '../api/users/user.action'
import { redirect } from 'next/navigation'
import EditProfileForm from '@/src/components/EditProfileForm'

export default async function Page() {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')
  return (
    <div>
      <section>
        <h1 className='text-2xl font-bold'>Profile</h1>
        <p className='text-lg'>Bienvenue : {user?.firstName}</p>
        <p className='text-lg'>Votre id est : {user?.id}</p>
        <p className='text-lg'>Votre email est : {user?.email}</p>
      </section>
      <section>
        <EditProfileForm
          id={user?.id }
          firstname={user.firstName }
          lastname={user.lastName}
          image={user.image}
          />
      </section>
    </div>
  )
}