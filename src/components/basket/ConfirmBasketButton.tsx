"use client"

import { useState } from "react"
import { Button } from "@/src/components/ui/button"
import { confirmBasketAction } from "@/app/api/basket/basket.action"
import { useRouter } from "next/navigation"

interface ConfirmBasketButtonProps {
  userId: string
  disabled?: boolean
}

export default function ConfirmBasketButton({ userId, disabled }: ConfirmBasketButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleConfirm = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await confirmBasketAction(userId)
      
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        router.push("/profile/checkout")
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
        onClick={handleConfirm}
        disabled={isLoading || disabled}
        className="w-full bg-green-600 hover:bg-green-700 text-white"
        size="lg"
      >
        {isLoading ? "Confirmation..." : "Confirmer la commande"}
      </Button>
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  )
}
