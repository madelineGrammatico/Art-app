"use client"

import { useEffect, useState } from "react"
import { Card } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"
import Link from "next/link"
import PurchasedItemsPanel, { type PurchasedInvoice } from "./PurchasedItemsPanel"

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30000

interface Props {
  sessionId: string
}

type Status = "polling" | "found" | "timeout"

export default function SuccessPaymentPolling({ sessionId }: Props) {
  const [invoices, setInvoices] = useState<PurchasedInvoice[]>([])
  const [status, setStatus] = useState<Status>("polling")

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `/api/invoices/by-session?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        )
        if (!res.ok) return
        const data: { invoices: PurchasedInvoice[] } = await res.json()
        if (cancelled) return
        if (data.invoices.length > 0) {
          setInvoices(data.invoices)
          setStatus("found")
        }
      } catch {
        // Silently retry on next interval
      }
    }

    fetchOnce()
    const interval = setInterval(() => {
      if (cancelled) return
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setStatus((current) => (current === "polling" ? "timeout" : current))
        clearInterval(interval)
        return
      }
      fetchOnce()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId])

  if (status === "found") {
    return <PurchasedItemsPanel invoices={invoices} />
  }

  if (status === "timeout") {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground mb-4">
          Votre paiement a bien été reçu mais nous ne parvenons pas à afficher le détail.
          Si la situation persiste, contactez-nous.
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/profile">
            <Button variant="outline" className="w-full">
              Retour au profil
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div
          aria-hidden="true"
          className="h-6 w-6 rounded-full border-2 border-green-600 border-t-transparent animate-spin"
        />
        <p className="text-muted-foreground">
          Confirmation de votre paiement en cours...
        </p>
      </div>
    </Card>
  )
}
