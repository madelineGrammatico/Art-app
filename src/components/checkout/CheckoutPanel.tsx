"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import { Separator } from "@/src/components/ui/separator"
import { Building2, Truck, Plus, Store } from "lucide-react"
import CheckoutButton from "./CheckoutButton"
import AddressForm, { SavedAddress } from "@/src/components/address/AddressForm"

type Rate = { shippingMethodId: string; label: string; priceHTCents: number }
type QuoteEntry = { artworkId: string; artworkTitle: string; rates: Rate[] }
type QuoteStatus = "idle" | "loading" | "ready" | "error" | "ineligible"

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

  // Devis transporteur affiché avant paiement (US2.4). On interroge le serveur dès
  // qu'on est en livraison avec une adresse choisie ; le prix montré ici = celui gelé
  // au paiement (incohérences #6/#7). Le prix serveur reste l'autorité (re-devis à la
  // création de session) — la sélection est juste transmise via shippingSelections.
  const [quotes, setQuotes] = useState<QuoteEntry[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("idle")
  const [quoteError, setQuoteError] = useState<string | null>(null)
  // Motif « livraison impossible » persistant : indépendant de quoteStatus, sinon le
  // re-run du useEffect (déclenché par le passage auto en PICKUP) le réinitialiserait et
  // le message disparaîtrait en une frame. Remis à false seulement au prochain devis DELIVERY.
  const [deliveryBlocked, setDeliveryBlocked] = useState(false)

  useEffect(() => {
    if (fulfillmentMode !== "DELIVERY" || !effectiveShippingId) {
      setQuoteStatus("idle")
      setQuotes([])
      return
    }

    let cancelled = false
    setQuoteStatus("loading")
    setQuoteError(null)
    setDeliveryBlocked(false)

    ;(async () => {
      try {
        const res = await fetch("/api/shipping/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shippingAddressId: effectiveShippingId }),
        })
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setQuoteStatus("error")
          setQuoteError(data.error ?? "Frais de livraison indisponibles")
          return
        }
        if (data.eligible === false) {
          // Le devis live révèle qu'une œuvre est hors gabarit (flag serveur stale) :
          // on bascule en retrait, seule option possible pour cette commande.
          setQuoteStatus("ineligible")
          setQuotes([])
          setDeliveryBlocked(true)
          setFulfillmentMode("PICKUP")
          return
        }

        const entries: QuoteEntry[] = data.quotes ?? []
        setQuotes(entries)
        // Sélection par défaut : la 1ʳᵉ offre de chaque œuvre (l'acheteur peut changer).
        const defaults: Record<string, string> = {}
        for (const q of entries) {
          if (q.rates.length > 0) defaults[q.artworkId] = q.rates[0].shippingMethodId
        }
        setSelections(defaults)
        setQuoteStatus("ready")
      } catch {
        if (cancelled) return
        setQuoteStatus("error")
        setQuoteError("Impossible de calculer les frais de livraison. Réessayez.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fulfillmentMode, effectiveShippingId])

  const rateFor = (q: QuoteEntry): Rate | undefined =>
    q.rates.find((r) => r.shippingMethodId === selections[q.artworkId])

  const shippingSubtotal =
    fulfillmentMode === "DELIVERY" && quoteStatus === "ready"
      ? quotes.reduce((sum, q) => sum + (rateFor(q)?.priceHTCents ?? 0) / 100, 0)
      : 0

  const grandTotal = total + shippingSubtotal

  const allArtworksSelected =
    quotes.length > 0 && quotes.every((q) => !!selections[q.artworkId])

  // Retrait : seule l'adresse de facturation est requise (US1bis). Livraison : adresse
  // + un devis prêt avec une offre choisie par œuvre (jamais payer sans port calculé).
  const canPay =
    fulfillmentMode === "PICKUP"
      ? !!billingId
      : !!billingId &&
        !!effectiveShippingId &&
        quoteStatus === "ready" &&
        allArtworksSelected

  const shippingSelectionsForButton = quotes.map((q) => ({
    artworkId: q.artworkId,
    shippingMethodId: selections[q.artworkId],
  }))

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
        {deliveryBlocked && (
          <p className="text-sm text-amber-900 mt-3">
            Après vérification, une œuvre de votre panier est hors gabarit transporteur
            standard : seul le retrait sur place est possible pour cette commande.
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

      {/* Choix du transporteur par œuvre (US2.4) — visible seulement en livraison. */}
      {fulfillmentMode === "DELIVERY" && (
        <Card className="p-6 bg-white">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Truck className="w-5 h-5 text-slate-600" />
            Livraison
          </h3>

          {quoteStatus === "loading" && (
            <p className="text-sm text-muted-foreground">
              Calcul des frais de livraison…
            </p>
          )}

          {quoteStatus === "error" && (
            <p className="text-sm text-destructive">
              {quoteError ?? "Frais de livraison indisponibles."}
            </p>
          )}

          {quoteStatus === "ready" &&
            quotes.map((q) => (
              <div key={q.artworkId} className="mb-4 last:mb-0">
                {quotes.length > 1 && (
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {q.artworkTitle}
                  </p>
                )}
                <div className="space-y-2">
                  {q.rates.map((rate) => (
                    <label
                      key={rate.shippingMethodId}
                      className={`flex items-center justify-between gap-3 border rounded-lg p-3 cursor-pointer transition ${
                        selections[q.artworkId] === rate.shippingMethodId
                          ? "border-green-500 bg-green-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className="flex items-center gap-3 text-sm text-slate-700">
                        <input
                          type="radio"
                          name={`shipping-${q.artworkId}`}
                          value={rate.shippingMethodId}
                          checked={selections[q.artworkId] === rate.shippingMethodId}
                          onChange={() =>
                            setSelections((prev) => ({
                              ...prev,
                              [q.artworkId]: rate.shippingMethodId,
                            }))
                          }
                        />
                        {rate.label}
                      </span>
                      <span className="text-sm font-semibold">
                        {(rate.priceHTCents / 100).toFixed(2)} €
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
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
          <div className="flex flex-col gap-1 text-white">
            <div className="flex justify-between items-center text-sm text-slate-300">
              <span>Œuvres</span>
              <span>{total.toFixed(2)} €</span>
            </div>
            {fulfillmentMode === "DELIVERY" && (
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span>Frais de port</span>
                <span>
                  {quoteStatus === "ready"
                    ? `${shippingSubtotal.toFixed(2)} €`
                    : quoteStatus === "loading"
                      ? "…"
                      : "—"}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center mt-1">
              <span className="text-lg font-semibold">Total</span>
              <span className="text-2xl font-bold">{grandTotal.toFixed(2)} €</span>
            </div>
          </div>
          <Separator className="bg-slate-700" />
          <CheckoutButton
            billingAddressId={billingId}
            shippingAddressId={effectiveShippingId}
            fulfillmentMode={fulfillmentMode}
            shippingSelections={shippingSelectionsForButton}
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
