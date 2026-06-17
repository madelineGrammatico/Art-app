import { Prisma, InvoiceType } from "@prisma/client"

// Préfixes en anglais (document client potentiellement non francophone, i18n prévue).
const PREFIX: Record<InvoiceType, string> = {
  SALE: "INV",
  CREDIT_NOTE: "CN",
}

export function counterKey(type: InvoiceType, year: number): string {
  return `${PREFIX[type]}:${year}`
}

export function formatInvoiceNumber(type: InvoiceType, year: number, seq: number): string {
  return `${PREFIX[type]}-${year}-${String(seq).padStart(6, "0")}`
}

/**
 * Réserve le prochain numéro séquentiel pour (type, année). À appeler DANS la
 * transaction qui crée la facture :
 *  - sans trou : l'incrément est annulé si la transaction rollback ;
 *  - concurrence sûre : `INSERT ... ON CONFLICT DO UPDATE` est atomique et pose
 *    un verrou de ligne sur le compteur → les émissions concurrentes se sérialisent.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  type: InvoiceType,
  year: number
): Promise<string> {
  const key = counterKey(type, year)
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"
  `
  return formatInvoiceNumber(type, year, rows[0].value)
}
