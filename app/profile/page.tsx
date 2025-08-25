import { auth } from '@/src/lib/auth/auth'
import { getUserAction } from '../api/users/user.action'
import { redirect } from 'next/navigation'
import EditProfileForm from '@/src/components/EditProfileForm'
import Image from 'next/image'
import { Card } from '@/src/components/ui/card'
import defaultImage from '@/public/rouge_gorge.png'
import { Separator } from "@/src/components/ui/separator"

export default async function Page() {
  const session = await auth()
  if (!session?.user.id) redirect('/sign-in')
  const userId = session?.user?.id 
  
  const user = await getUserAction(userId)
  if (!user) redirect('/sign-in')
  return (
    <div className='w-full flex-1 mx-auto flex flex-vertical '>
      <div className=' p-6 max-w-sm border w-1/3'>
        <header className="w-lg rounded-2xl bg-white border flex flex-col items-center space-y-4  p-6 mt-4">
        <h1 className='text-2xl font-bold'>Profile</h1>
        <Image src={user.image ==="NULL"? user.image :defaultImage} alt="Avatar" className='w-16 h-16 rounded-full my-6 object-cover'/>
        <div>
          <p className='text-lg'>{user.firstName}</p>
          <p className='text-lg'>{user.lastName}</p>
        </div>
        </header>
        <div>
          <p>Mon compte</p>
          <p>Mes commandes</p>
          <p>Mon panier</p>
        </div>
      </div>
      <div className=' p-6 flex-1'>
        <h2 className='text-2xl font-bold'>Mes Infomations Personnelles</h2>
        <Separator className='mb-4'/>
        <div className='w-full flex flex-vertical flex-wrap items-start'>
        
          <div className='flex-1 p-6 flex flex-col'>
            <Image src={user.image ==="NULL"? user.image :defaultImage} alt="Avatar" className='w-32 h-32 rounded-full my-6 object-cover'/>
            <p className='text-lg'>{user.firstName}</p>
            <p className='text-lg'>{user.lastName}</p>
            <p className='text-lg'>{user?.email}</p>
          </div>
          <Card className='flex flex-col p-6 bg-slate-400 text-white w-1/2 h-fit max-w-sm'>
            <EditProfileForm
              id={user?.id}
              firstname={user.firstName}
              lastname={user.lastName}
              image={user.image}
              />
          </Card>
        </div>
      </div>
      
      
    </div>
  )
}