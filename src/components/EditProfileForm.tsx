"use client";

import { updateUserAction } from "@/app/api/users/user.action";
import { Label } from "@radix-ui/react-label";
import { startTransition, useState } from "react";
import { Button } from "./ui/button";
import { useSession } from "next-auth/react";
import { Input } from "./ui/input";

export default function EditProfileForm({id, firstname, lastname, image }: {
    id: string;
    firstname: string | null;
    lastname: string | null;
    image: string | null;
}) {
    const {update} = useSession()
    const [newFirstname, setNewfirstName] = useState(firstname || "")
    const [newLastname, setNewLastName] = useState(lastname || "")
    const [newImage, setNewImage] = useState(image  || "")

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        console.log("handleSubmit called")
        startTransition(async () => {
            console.log("startTransition user with id:", id);
            const user = await updateUserAction(id,{
                firstName: newFirstname,
                lastName: newLastname,
                image: newImage
            })
            console.log("handleSubmit user updated:", user);
            if(user)update()
        })
    }
        
  return (
    <form
      onSubmit={(e) => handleSubmit(e)}
      className="flex flex-col space-y-4 py-2"
    >
      <Label className="text-white text-sm font-medium">
          Prénom
          <Input
              defaultValue={newFirstname}
              className="bg-white text-black mt-1"
              onChange={(e) => setNewfirstName(e.target.value)}
          />
      </Label>
      <Label className="text-white text-sm font-medium">
          Nom
          <Input
              defaultValue={newLastname}
              className="bg-white text-black mt-1"
              onChange={(e) => setNewLastName(e.target.value)}
          />
      </Label>
      <Label className="text-white text-sm font-medium">
          Image
          <Input 
              defaultValue={newImage}
              className="bg-white text-black mt-1"
              onChange={(e) => {setNewImage(e.target.value)}}
          />
      </Label>
      <Button type="submit" variant="destructive" className="mt-2 ">
          Enregistrer
      </Button>
    </form>
  )
}
