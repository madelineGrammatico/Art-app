import { Prisma, type Invoice } from "@prisma/client"
import { getSellerConfig } from "./sellerConfig"
import { nextInvoiceNumber } from "./numbering"

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
  }
): Promise<Invoice> {
  const seller = getSellerConfig()
  const vatRate = new Prisma.Decimal(seller.vatRate)
  const number = await nextInvoiceNumber(tx, "SALE", args.saleDate.getFullYear())

  const lineItems = args.soldItems.map((item) => {
    const unitPriceHT = new Prisma.Decimal(item.unitPriceHT)
    const lineHT = unitPriceHT // quantity = 1
    const vatAmount = round2(lineHT.times(vatRate))
    const lineTTC = lineHT.plus(vatAmount)
    return {
      artworkId: item.artworkId,
      label: item.label,
      unitPriceHT,
      quantity: 1,
      vatRate,
      vatAmount,
      lineTTC,
    }
  })

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
  })
}
