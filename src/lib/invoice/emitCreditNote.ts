import { Prisma, type Invoice, type InvoiceLineItem } from "@prisma/client"
import { nextInvoiceNumber } from "./numbering"
import { parisYear } from "./invoiceViewModel"

/**
 * Émet une facture d'avoir (CREDIT_NOTE) créditant une facture de vente, DANS la
 * transaction passée. Conforme à l'immuabilité (EPIC 5/6) :
 *  - le snapshot (vendeur, identité + adresses acheteur, régime/mention TVA) est
 *    COPIÉ depuis la facture d'origine, jamais relu depuis la config (qui a pu
 *    changer) → l'avoir reflète fidèlement le document qu'il crédite ;
 *  - les montants sont NÉGATIFS (crédit) ; le taux de TVA reste inchangé ;
 *  - numéro propre à la série CN, gapless (cf. nextInvoiceNumber) ;
 *  - la facture de vente d'origine n'est jamais mutée.
 *
 * Remboursement partiel : seules les œuvres listées dans `items` sont créditées.
 */
export async function emitCreditNote(
  tx: Prisma.TransactionClient,
  args: {
    originalInvoiceId: string
    items: { artworkId: string }[]
    stripeRefundId: string
    saleDate: Date
  }
): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
  const original = await tx.invoice.findUnique({
    where: { id: args.originalInvoiceId },
    include: { lineItems: true },
  })
  if (!original) {
    throw new Error(`Facture d'origine introuvable : ${args.originalInvoiceId}`)
  }
  if (original.type !== "SALE") {
    throw new Error("Un avoir ne peut créditer qu'une facture de vente")
  }

  // Multimap : une œuvre peut porter 2 lignes (ARTWORK + SHIPPING, B14). Créditer un
  // artworkId crédite TOUTES ses lignes — l'aller (SHIPPING) est remboursé avec l'œuvre.
  const linesByArtwork = new Map<string, typeof original.lineItems>()
  for (const l of original.lineItems) {
    const arr = linesByArtwork.get(l.artworkId) ?? []
    arr.push(l)
    linesByArtwork.set(l.artworkId, arr)
  }
  const creditLines = args.items.flatMap(({ artworkId }) => {
    const lines = linesByArtwork.get(artworkId)
    if (!lines || lines.length === 0) {
      throw new Error(
        `L'œuvre ${artworkId} n'est pas présente sur la facture ${original.number}`
      )
    }
    return lines.map((line) => ({
      type: line.type,
      artworkId: line.artworkId,
      label: line.label,
      unitPriceHT: line.unitPriceHT.negated(),
      quantity: line.quantity,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount.negated(),
      lineTTC: line.lineTTC.negated(),
      shippingMethodId: line.shippingMethodId,
    }))
  })

  const zero = new Prisma.Decimal(0)
  const totalHT = creditLines.reduce((acc, l) => acc.plus(l.unitPriceHT), zero)
  const totalVat = creditLines.reduce((acc, l) => acc.plus(l.vatAmount), zero)
  const totalTTC = creditLines.reduce((acc, l) => acc.plus(l.lineTTC), zero)

  const number = await nextInvoiceNumber(tx, "CREDIT_NOTE", parisYear(args.saleDate))

  return tx.invoice.create({
    data: {
      type: "CREDIT_NOTE",
      number,
      saleDate: args.saleDate,
      creditedInvoiceId: original.id,
      stripeRefundId: args.stripeRefundId,

      buyerId: original.buyerId,
      buyerName: original.buyerName,
      // Mode de remise copié de la facture d'origine (l'avoir reflète le document crédité ;
      // sinon le défaut Prisma DELIVERY contredirait une vente PICKUP).
      fulfillmentMode: original.fulfillmentMode,

      // Snapshot vendeur copié de la facture d'origine (immuabilité légale).
      sellerName: original.sellerName,
      sellerLegalForm: original.sellerLegalForm,
      sellerAddress: original.sellerAddress,
      sellerSiret: original.sellerSiret,
      sellerRcs: original.sellerRcs,
      sellerVatNumber: original.sellerVatNumber,
      vatRegime: original.vatRegime,
      legalMention: original.legalMention,

      // Snapshot adresses copié de la facture d'origine.
      billingAddressId: original.billingAddressId,
      billingStreet: original.billingStreet,
      billingPostalCode: original.billingPostalCode,
      billingCity: original.billingCity,
      billingCountry: original.billingCountry,
      shippingAddressId: original.shippingAddressId,
      shippingStreet: original.shippingStreet,
      shippingPostalCode: original.shippingPostalCode,
      shippingCity: original.shippingCity,
      shippingCountry: original.shippingCountry,

      totalHT,
      totalVat,
      totalTTC,

      lineItems: { create: creditLines },
    },
    include: { lineItems: true },
  })
}
