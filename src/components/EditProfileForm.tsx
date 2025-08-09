"use client";

import { updateUserAction } from "@/app/api/users/user.action";
import { Label } from "@radix-ui/react-label";
import { useState } from "react";
import { Button } from "./ui/button";

export default function EditProfileForm({id, firstname, lastname, image }: {
    id: string;
    firstname: string | null;
    lastname: string | null;
    image: string | null;
}) {
    const [newFirstname, setNewfirstName] = useState(firstname || "")
    const [newLastname, setNewLastName] = useState(lastname || "")
    const [newImage, setNewImage] = useState(image  || "")

    const handleSubmit = async (FormData: FormData) => {
        await updateUserAction(id,{
            firstName: String(FormData.get("newFirstname")),
            lastName: String(FormData.get("newLastname")),
            image: String(FormData.get("newImage"))
        })
    }
        
  return (
    <div>
    <form
      action={(FormData) => handleSubmit(FormData)}
    >
        <Label>
            Prénom
            <input
                defaultValue={newFirstname}
                name="firstName"
                className="bg-white text-black"
                onChange={(e) => setNewfirstName(e.target.value)}
            />
        </Label>
        <Label>
            Nom
            <input
                defaultValue={newLastname}
                name="lastName"
                className="bg-white text-black"
                onChange={(e) => setNewLastName(e.target.value)}
            />
        </Label>
        <Label>
            Image
            <input 
                defaultValue={newImage}
                name="image"
                className="bg-white text-black"
                onChange={(e) => setNewImage(e.target.value)}
            />
        </Label>
        <Button type="submit">
            Enregistrer
        </Button>
    </form>
    </div>
  )
}
