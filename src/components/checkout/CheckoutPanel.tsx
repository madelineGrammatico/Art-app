"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import { Separator } from "@/src/components/ui/separator"
import { Building2, Truck, Plus, Store } from "lucide-react"
import CheckoutButton from "./CheckoutButton"
import AddressForm, { SavedAddress } from "@/src/components/address/AddressForm"

type Props = {
  userId: string
  addresses: SavedAddress[]
  total: number
  // Indice serveur (flag stocké) : false si au moins une œuvre est hors gabarit
  // transporteur standard → retrait sur place imposé. Le devis live au checkout
  // reste l'autorité (spec §2) ; ce booléen ne sert qu'à l'UX.
  deliveryAvailable: boolean
}

export default function CheckoutPanel({
  userId,
  addresses: initialAddresses,
  total,
  deliveryAvailable,
}: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[]>(initialAddresses)
  const [fulfillmentMode, setFulfillmentMode] = useState<"DELIVERY" | "PICKUP">(
    deliveryAvailable ? "DELIVERY" : "PICKUP"
  )

  // When the user lands at checkout with no address, surface the form
  // immediately — the redirect to /profile/addresses used to break the
  // checkout context.
  const [isAddingAddress, setIsAddingAddress] = useState<boolean>(
    addresses.length === 0
  )

  // Defaults computed from current addresses (may be undefined when empty,
  // hooks still run unconditionally to respect React rules of hooks).
  const defaultBilling =
    addresses.find((a) => a.isDefaultBilling) ?? addresses[0]
  const defaultShipping =
    addresses.find((a) => a.isDefaultShipping) ?? defaultBilling

  const [billingId, setBillingId] = useState<string>(defaultBilling?.id ?? "")
  const [shippingId, setShippingId] = useState<string>(defaultShipping?.id ?? "")
  const [sameAsBilling, setSameAsBilling] = useState<boolean>(
    !defaultBilling ||
      !defaultShipping ||
      defaultBilling.id === defaultShipping.id
  )

  const handleAddressCreated = (newAddress: SavedAddress) => {
    setAddresses((prev) => [newAddress, ...prev])
    // First-address flow: auto-select for both billing and shipping so the
    // user can pay in one more click. For subsequent adds, also auto-select
    // — the user just typed it, they almost certainly want to use it.
    setBillingId(newAddress.id)
    setShippingId(newAddress.id)
    setSameAsBilling(true)
    setIsAddingAddress(false)
  }

  const effectiveShippingId = sameAsBilling ? billingId : shippingId
  // Retrait : seule l'adresse de facturation est requise (US1bis). Livraison : les deux.
  const canPay =
    fulfillmentMode === "PICKUP"
      ? !!billingId
      : !!billingId && !!effectiveShippingId

  // Empty state: inline form (no cancel, no escape — user must add to
  // proceed), with a fallback link back to the basket.
  if (addresses.length === 0) {
    return (
      <Card className="p-6 bg-white">
        <p className="text-sm text-muted-foreground mb-4 text-center">
          Ajoutez votre adresse pour finaliser votre commande.
        </p>
        <AddressForm
          userId={userId}
          onSuccess={handleAddressCreated}
          onCancel={() => {}}
          hideCancel
          formIdSuffix="checkout-empty"
        />
        <div className="mt-4 text-center">
          <Link
            href="/profile/basket"
            className="text-sm text-slate-600 hover:underline"
          >
            Retour au panier
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6 bg-white">
        <h3 className="text-lg font-semibold mb-4">Mode de remise</h3>
        {!deliveryAvailable && (
          <p className="text-sm text-amber-900 mb-3">
            Une ou plusieurs œuvres sont hors gabarit transporteur standard
            (volumineuses/fragiles) : seul le retrait sur place est possible.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex items-center gap-3 border rounded-lg p-3 transition ${
              !deliveryAvailable
                ? "border-slate-200 opacity-50 cursor-not-allowed"
                : fulfillmentMode === "DELIVERY"
                  ? "border-blue-500 bg-blue-50 cursor-pointer"
                  : "border-slate-200 hover:border-slate-300 cursor-pointer"
            }`}
          >
            <input
              type="radio"
              name="fulfillmentMode"
              value="DELIVERY"
              checked={fulfillmentMode === "DELIVERY"}
              disabled={!deliveryAvailable}
              onChange={() => setFulfillmentMode("DELIVERY")}
            />
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Truck className="w-4 h-4 text-slate-600" />
              Livraison
            </span>
          </label>
          <label
            className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition ${
              fulfillmentMode === "PICKUP"
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="fulfillmentMode"
              value="PICKUP"
              checked={fulfillmentMode === "PICKUP"}
              onChange={() => setFulfillmentMode("PICKUP")}
            />
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Store className="w-4 h-4 text-slate-600" />
              Retrait sur place
            </span>
          </label>
        </div>
        {fulfillmentMode === "PICKUP" && (
          <p className="text-sm text-muted-foreground mt-3">
            Retrait sur place : nous vous contacterons par email après paiement pour
            convenir d'un rendez-vous.
          </p>
        )}
      </Card>

      <Card className="p-6 bg-white">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-slate-600" />
          Adresse de facturation
        </h3>
        <div className="space-y-2">
          {addresses.map((addr) => (
            <label
              key={addr.id}
              className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition ${
                billingId === addr.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="billingAddress"
                value={addr.id}
                checked={billingId === addr.id}
                onChange={() => setBillingId(addr.id)}
                className="mt-1"
              />
              <span className="text-sm text-slate-700">
                {addr.street}
                <br />
                {addr.postalCode} {addr.city}, {addr.country}
              </span>
            </label>
          ))}
        </div>
      </Card>

      {fulfillmentMode === "DELIVERY" && (
      <Card className="p-6 bg-white">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="w-5 h-5 text-slate-600" />
            Adresse de livraison
          </h3>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(e) => setSameAsBilling(e.target.checked)}
            />
            Identique à la facturation
          </label>
        </div>
        {!sameAsBilling && (
          <div className="space-y-2">
            {addresses.map((addr) => (
              <label
                key={addr.id}
                className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition ${
                  shippingId === addr.id
                    ? "border-green-500 bg-green-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="shippingAddress"
                  value={addr.id}
                  checked={shippingId === addr.id}
                  onChange={() => setShippingId(addr.id)}
                  className="mt-1"
                />
                <span className="text-sm text-slate-700">
                  {addr.street}
                  <br />
                  {addr.postalCode} {addr.city}, {addr.country}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Link
            href="/profile/addresses"
            className="text-sm text-slate-600 hover:underline inline-flex items-center gap-1"
          >
            Gérer mes adresses
          </Link>
        </div>
      </Card>
      )}

      {isAddingAddress ? (
        <Card className="p-6 bg-white border-2 border-blue-500 shadow-lg">
          <AddressForm
            userId={userId}
            onSuccess={handleAddressCreated}
            onCancel={() => setIsAddingAddress(false)}
            formIdSuffix="checkout-add"
          />
        </Card>
      ) : (
        <Button
          onClick={() => setIsAddingAddress(true)}
          variant="outline"
          className="w-full border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une autre adresse
        </Button>
      )}

      <Card className="p-6 bg-slate-900">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center text-white">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-bold">{total.toFixed(2)} €</span>
          </div>
          <Separator className="bg-slate-700" />
          <CheckoutButton
            billingAddressId={billingId}
            shippingAddressId={effectiveShippingId}
            fulfillmentMode={fulfillmentMode}
            disabled={!canPay}
          />
          <Link href="/profile/basket">
            <Button variant="outline" className="w-full">
              Retour au panier
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
