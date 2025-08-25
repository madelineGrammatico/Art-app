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
      className="flex flex-col space-y-4 p-2 mt-6"
    >
        <Label>
            Prénom
            <Input
                defaultValue={newFirstname}
                className="bg-white text-black"
                onChange={(e) => setNewfirstName(e.target.value)}
            />
        </Label>
        <Label>
            Nom
            <Input
                defaultValue={newLastname}
                className="bg-white text-black"
                onChange={(e) => setNewLastName(e.target.value)}
            />
        </Label>
        <Label>
            Image
            <Input 
                defaultValue={newImage}
                className="bg-white text-black"
                onChange={(e) => {setNewImage(e.target.value)}}
            />
        </Label>
        <Button type="submit">
            Enregistrer
        </Button>
    </form>
  )
}
