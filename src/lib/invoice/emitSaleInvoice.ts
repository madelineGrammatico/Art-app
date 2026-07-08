import { Prisma, type Invoice, type InvoiceLineItem } from "@prisma/client"
import { getSellerConfig } from "./sellerConfig"
import { nextInvoiceNumber } from "./numbering"
import { parisYear } from "./invoiceViewModel"

export type AddressSnapshot = {
  fk: string | null
  street: string | null
  postalCode: string | null
  city: string | null
  country: string | null
}

export type SoldItem = {
  artworkId: string
  label: string
  unitPriceHT: Prisma.Decimal | number | string
}

// Devis transporteur gelé au checkout (1 colis = 1 œuvre). unitPriceHT = prix figé du
// devis Sendcloud ; vatRate est celui du régime de la facture, calculé ici (spec §4).
export type ShippingSelection = {
  artworkId: string
  shippingMethodId: string
  label: string
  unitPriceHT: Prisma.Decimal | number | string
}

const EMPTY_ADDRESS: AddressSnapshot = {
  fk: null,
  street: null,
  postalCode: null,
  city: null,
  country: null,
}

// Arrondi commercial (demi-supérieur) à 2 décimales — règle B13 (spec §5).
function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Émet une facture de vente (SALE) + ses line items, DANS la transaction passée.
 * - numéro séquentiel réservé via nextInvoiceNumber (gapless) ;
 * - snapshot vendeur figé depuis la config (getSellerConfig) ;
 * - TVA calculée et figée par ligne (taux du régime courant).
 * Le numéro et les totaux sont immuables une fois la transaction committée.
 */
export async function emitSaleInvoice(
  tx: Prisma.TransactionClient,
  args: {
    buyerId: string
    buyerName: string
    stripeSessionId: string
    stripePaymentIntentId: string | null
    soldItems: SoldItem[]
    saleDate: Date
    billing?: AddressSnapshot | null
    shipping?: AddressSnapshot | null
    fulfillmentMode?: "DELIVERY" | "PICKUP"
    shippingSelections?: ShippingSelection[]
  }
): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
  const seller = getSellerConfig()
  const vatRate = new Prisma.Decimal(seller.vatRate)
  const number = await nextInvoiceNumber(tx, "SALE", parisYear(args.saleDate))
  const fulfillmentMode = args.fulfillmentMode ?? "DELIVERY"

  // Construit une ligne (TVA au taux du régime, arrondi demi-supérieur). quantity = 1.
  const buildLine = (
    type: "ARTWORK" | "SHIPPING",
    item: { artworkId: string; label: string; unitPriceHT: Prisma.Decimal | number | string },
    shippingMethodId: string | null = null
  ) => {
    const unitPriceHT = new Prisma.Decimal(item.unitPriceHT)
    const vatAmount = round2(unitPriceHT.times(vatRate))
    return {
      type,
      artworkId: item.artworkId,
      label: item.label,
      unitPriceHT,
      quantity: 1,
      vatRate,
      vatAmount,
      lineTTC: unitPriceHT.plus(vatAmount),
      shippingMethodId,
    }
  }

  const artworkLines = args.soldItems.map((item) => buildLine("ARTWORK", item))

  // Lignes SHIPPING : uniquement en DELIVERY, 1 par œuvre effectivement transférée
  // (les sélections d'œuvres en race — non transférées — sont ignorées, spec §3.C).
  // unitPriceHT = prix gelé du devis ; vatRate = régime de la facture (spec §4).
  const shippingLines: ReturnType<typeof buildLine>[] = []
  if (fulfillmentMode === "DELIVERY" && args.shippingSelections?.length) {
    const selectionByArtwork = new Map(
      args.shippingSelections.map((s) => [s.artworkId, s])
    )
    for (const item of args.soldItems) {
      const selection = selectionByArtwork.get(item.artworkId)
      if (!selection) {
        // Œuvre livrée sans devis figé → on refuse plutôt que de facturer un shipping à 0 €.
        throw new Error(
          `Devis transporteur manquant pour l'œuvre ${item.artworkId} (mode DELIVERY).`
        )
      }
      shippingLines.push(
        buildLine("SHIPPING", selection, selection.shippingMethodId)
      )
    }
  }

  const lineItems = [...artworkLines, ...shippingLines]

  const zero = new Prisma.Decimal(0)
  const totalHT = lineItems.reduce((acc, l) => acc.plus(l.unitPriceHT), zero)
  const totalVat = lineItems.reduce((acc, l) => acc.plus(l.vatAmount), zero)
  const totalTTC = lineItems.reduce((acc, l) => acc.plus(l.lineTTC), zero)

  const billing = args.billing ?? EMPTY_ADDRESS
  const shipping = args.shipping ?? EMPTY_ADDRESS

  return tx.invoice.create({
    data: {
      type: "SALE",
      number,
      saleDate: args.saleDate,
      buyerId: args.buyerId,
      buyerName: args.buyerName,
      stripeSessionId: args.stripeSessionId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      fulfillmentMode,

      sellerName: seller.name,
      sellerLegalForm: seller.legalForm,
      sellerAddress: seller.address,
      sellerSiret: seller.siret,
      sellerRcs: seller.rcs,
      sellerVatNumber: seller.vatNumber,
      vatRegime: seller.vatRegime,
      legalMention: seller.legalMention,

      billingAddressId: billing.fk,
      billingStreet: billing.street,
      billingPostalCode: billing.postalCode,
      billingCity: billing.city,
      billingCountry: billing.country,
      shippingAddressId: shipping.fk,
      shippingStreet: shipping.street,
      shippingPostalCode: shipping.postalCode,
      shippingCity: shipping.city,
      shippingCountry: shipping.country,

      totalHT,
      totalVat,
      totalTTC,

      lineItems: { create: lineItems },
    },
    include: { lineItems: true },
  })
}
