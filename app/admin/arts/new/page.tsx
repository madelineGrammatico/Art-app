import { Label } from '@radix-ui/react-label'
// import Form from 'next/form'
import { Input } from '@/src/components/ui/input' 
import { Button } from '@/src/components/ui/button'

export default function Page() {
  return (
    <form action="/api/arts" method='POST'
        className='flex flex-col w-full p-4 gap-4'
    >
        <Label>
            Titre
            <Input name="title"/>
        </Label>
        <Label>
            Prix
            <Input name="price"/>
        </Label>
        <Button 
            type="submit"
            size='lg'
        >Ajouter</Button>
    </form>
  )
}
