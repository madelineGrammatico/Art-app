"use client"

import { useState } from "react"
import { Button } from "@/src/components/ui/button"
import { addToBasketAction } from "@/app/api/basket/basket.action"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface AddToBasketButtonProps {
  artworkId: string
  className?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "bubule"
  size?: "default" | "sm" | "lg" | "icon"
}

export default function AddToBasketButton({ 
  artworkId, 
  className,
  variant = "default",
  size = "default"
}: AddToBasketButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { data: session } = useSession()
  const router = useRouter()

  const handleAddToBasket = async () => {
    if (!session?.user?.id) {
      setError("Vous devez être connecté pour ajouter au panier")
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await addToBasketAction(session.user.id, artworkId)
      
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
          router.refresh()
        }, 1000)
      }
    } catch (err) {
      setError("Une erreur est survenue")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleAddToBasket}
        disabled={isLoading || !session?.user}
        variant={variant}
        size={size}
        className={className}
      >
        {isLoading ? "Ajout..." : success ? "✓ Ajouté" : "Ajouter au panier"}
      </Button>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
