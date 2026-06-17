import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId")
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId manquant" }, { status: 400 })
    }

    // Facture de vente de la commande (ses line items = œuvres réellement achetées).
    const invoice = await prisma.invoice.findFirst({
      where: {
        buyerId: session.user.id,
        type: "SALE",
        stripeSessionId: sessionId,
      },
      include: { lineItems: { include: { artwork: true } } },
    })

    // Œuvres remboursées au checkout (race) : pas de facture, mais à afficher.
    const refunded = await prisma.refundRecovery.findMany({
      where: { buyerId: session.user.id, stripeSessionId: sessionId },
      include: { artwork: true },
    })

    const paidItems = (invoice?.lineItems ?? []).map((line) => ({
      id: line.id,
      amount: Number(line.lineTTC),
      status: "PAID" as const,
      artwork: {
        id: line.artwork.id,
        title: line.artwork.title,
        price: Number(line.artwork.price),
      },
    }))

    const refundedItems = refunded.map((rec) => ({
      id: rec.id,
      amount: Number(rec.amount),
      status: "REFUNDED" as const,
      artwork: {
        id: rec.artwork.id,
        title: rec.artwork.title,
        price: Number(rec.artwork.price),
      },
    }))

    return NextResponse.json({ invoices: [...paidItems, ...refundedItems] })
  } catch (error) {
    console.error("Error fetching invoices by session:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des factures" },
      { status: 500 }
    )
  }
}
