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

    const invoices = await prisma.invoice.findMany({
      where: {
        buyerId: session.user.id,
        stripeSessionId: sessionId,
        status: "PAID",
      },
      include: { artwork: true },
      orderBy: { createdAt: "desc" },
    })

    const invoicesWithNumberPrice = invoices.map((invoice) => ({
      id: invoice.id,
      amount: Number(invoice.amount),
      status: invoice.status,
      artwork: {
        id: invoice.artwork.id,
        title: invoice.artwork.title,
        price: Number(invoice.artwork.price),
      },
    }))

    return NextResponse.json({ invoices: invoicesWithNumberPrice })
  } catch (error) {
    console.error("Error fetching invoices by session:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des factures" },
      { status: 500 }
    )
  }
}
