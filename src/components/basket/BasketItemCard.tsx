"use client"

import { useState } from "react"
import { Card, CardContent } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import { removeFromBasketAction } from "@/app/api/basket/basket.action"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { BasketItem } from "@prisma/client"

interface ArtworkWithNumberPrice {
  id: string
  title: string
  price: number
  ownerId: string | null
  certificateId: string | null
  createdAt: Date
}

interface BasketItemWithArtwork extends BasketItem {
  artwork: ArtworkWithNumberPrice
}

interface BasketItemCardProps {
  item: BasketItemWithArtwork
}

export default function BasketItemCard({ item }: BasketItemCardProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: session } = useSession()
  const router = useRouter()

  const handleRemove = async () => {
    setIsRemoving(true)
    setError(null)

    try {
      if (!session?.user?.id) {
        setError("Vous devez être connecté")
        return
      }

      const result = await removeFromBasketAction(session.user.id, item.id)

      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError("Une erreur est survenue")
    } finally {
      setIsRemoving(false)
    }
  }

  const price = item.artwork.price

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{item.artwork.title}</h3>
            <p className="text-sm text-muted-foreground">
              Prix : {price.toFixed(2)} €
            </p>
            {item.artwork.ownerId !== null && (
              <p className="text-sm text-destructive mt-1">
                ⚠️ Cette oeuvre n'est plus disponible
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right min-w-[100px]">
              <p className="font-semibold">{price.toFixed(2)} €</p>
            </div>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? "Suppression..." : "Retirer"}
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
