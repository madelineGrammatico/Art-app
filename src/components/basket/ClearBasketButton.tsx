"use client"

import { useState } from "react"
import { Button } from "@/src/components/ui/button"
import { clearBasketAction } from "@/app/api/basket/basket.action"
import { useRouter } from "next/navigation"

interface ClearBasketButtonProps {
  userId: string
}

export default function ClearBasketButton({ userId }: ClearBasketButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleClear = async () => {
    if (!confirm("Êtes-vous sûr de vouloir vider votre panier ?")) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await clearBasketAction(userId)
      
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
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
        variant="destructive"
        onClick={handleClear}
        disabled={isLoading}
        className="flex-1"
      >
        {isLoading ? "Vidage..." : "Vider le panier"}
      </Button>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
