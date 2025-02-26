"use client"
import { Button } from "@/src/components/ui/button"
import { useState } from "react"
import { deleteArtAction } from "./arts/arts.action"
import { useRouter } from "next/navigation"

export  function DeleteArtButton({id}: {id: string}) {
    const [isConfirm, setIsConfirm] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        const result = await deleteArtAction(id)
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
