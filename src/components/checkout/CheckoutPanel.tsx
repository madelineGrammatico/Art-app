"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import { Separator } from "@/src/components/ui/separator"
import { MapPin, Building2, Truck, Plus } from "lucide-react"
import CheckoutButton from "./CheckoutButton"

type PostalAddress = {
  id: string
  street: string
  postalCode: string
  city: string
  country: string
  isDefaultBilling: boolean
  isDefaultShipping: boolean
}

type Props = {
  addresses: PostalAddress[]
  total: number
}

export default function CheckoutPanel({ addresses, total }: Props) {
  if (addresses.length === 0) {
    return (
      <Card className="p-8 text-center bg-white">
        <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">
          Aucune adresse enregistrée
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Vous devez enregistrer au moins une adresse pour finaliser votre commande.
        </p>
        <Link href="/profile/addresses">
          <Button className="bg-black text-white hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-2" />
            Ajouter une adresse
          </Button>
        </Link>
      </Card>
    )
  }

  const defaultBilling = addresses.find((a) => a.isDefaultBilling) ?? addresses[0]
  const defaultShipping =
    addresses.find((a) => a.isDefaultShipping) ?? defaultBilling

  const [billingId, setBillingId] = useState<string>(defaultBilling.id)
  const [sameAsBilling, setSameAsBilling] = useState<boolean>(
    defaultBilling.id === defaultShipping.id
  )
  const [shippingId, setShippingId] = useState<string>(defaultShipping.id)

  const effectiveShippingId = sameAsBilling ? billingId : shippingId
  const canPay = !!billingId && !!effectiveShippingId

  return (
    <div className="flex flex-col gap-4">
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
            <Plus className="w-3 h-3" />
            Gérer mes adresses
          </Link>
        </div>
      </Card>

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
