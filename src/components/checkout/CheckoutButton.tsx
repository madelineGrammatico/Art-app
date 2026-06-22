"use client"

import { useState } from "react"
import { Button } from "@/src/components/ui/button"

type Props = {
  billingAddressId: string
  shippingAddressId: string
  fulfillmentMode: "DELIVERY" | "PICKUP"
  disabled?: boolean
}

export default function CheckoutButton({
  billingAddressId,
  shippingAddressId,
  fulfillmentMode,
  disabled,
}: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingAddressId,
          fulfillmentMode,
          // L'adresse de livraison n'est pertinente qu'en livraison.
          ...(fulfillmentMode === "DELIVERY" ? { shippingAddressId } : {}),
        }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        throw new Error(data.error || "Erreur lors de la création de la session de paiement")
      }

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error("URL de paiement non disponible")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleCheckout}
        disabled={isLoading || disabled}
        className="w-full bg-green-600 hover:bg-green-700 text-white"
        size="lg"
      >
        {isLoading ? "Redirection vers Stripe..." : "Payer avec Stripe"}
      </Button>
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  )
}
