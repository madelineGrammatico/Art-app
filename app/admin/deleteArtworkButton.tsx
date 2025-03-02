"use client"
import { Button } from "@/src/components/ui/button"
import { useState } from "react"
import { deleteArtworkAction } from "./artworks/artwork.action"
import { useRouter } from "next/navigation"

export  function DeleteArtworkButton({id}: {id: string}) {
    const [isConfirm, setIsConfirm] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        const result = await deleteArtworkAction(id)
        if (result) {
          router.refresh()
        }
    }
    
  return (
    <Button
        onClick={() => {
            if (isConfirm) handleDelete()
            else setIsConfirm(true)
        }}
        variant={ isConfirm ? "destructive": "outline"}
    >X</Button>
  )
}
