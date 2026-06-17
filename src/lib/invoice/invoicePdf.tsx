import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { InvoiceViewModel } from "./invoiceViewModel"

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 18, marginBottom: 2 },
  muted: { color: "#555" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  block: { marginBottom: 14 },
  section: { marginBottom: 8 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: { flexDirection: "row", paddingVertical: 3 },
  cLabel: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cPrice: { flex: 2, textAlign: "right" },
  totals: { marginTop: 10, alignItems: "flex-end" },
  legal: { marginTop: 16, fontSize: 9, color: "#555" },
})

const eur = (n: number) => `${n.toFixed(2)} €`

function InvoicePdf({ vm }: { vm: InvoiceViewModel }) {
  return (
    <Document title={`Facture ${vm.number}`}>
      <Page size="A4" style={styles.page}>
        {/* En-tête : vendeur + facture */}
        <View style={[styles.spaceBetween, styles.block]}>
          <View>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{vm.seller.name}</Text>
            <Text style={styles.muted}>{vm.seller.legalForm}</Text>
            <Text style={styles.muted}>{vm.seller.address}</Text>
            <Text style={styles.muted}>SIRET : {vm.seller.siret}</Text>
            {vm.seller.rcs ? <Text style={styles.muted}>RCS : {vm.seller.rcs}</Text> : null}
            {vm.seller.vatNumber ? (
              <Text style={styles.muted}>TVA : {vm.seller.vatNumber}</Text>
            ) : null}
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={styles.h1}>Facture</Text>
            <Text>{vm.number}</Text>
            <Text style={styles.muted}>Émise le {vm.issuedAt}</Text>
            <Text style={styles.muted}>Vente du {vm.saleDate}</Text>
          </View>
        </View>

        {/* Client */}
        <View style={styles.block}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Facturé à</Text>
          <Text>{vm.buyer.name}</Text>
          {vm.buyer.billingAddress ? <Text>{vm.buyer.billingAddress}</Text> : null}
          {vm.buyer.shippingAddress ? (
            <Text style={styles.muted}>Livraison : {vm.buyer.shippingAddress}</Text>
          ) : null}
        </View>

        {/* Lignes */}
        <View style={styles.tableHeader}>
          <Text style={styles.cLabel}>Désignation</Text>
          <Text style={styles.cQty}>Qté</Text>
          <Text style={styles.cPrice}>PU HT</Text>
          <Text style={styles.cPrice}>Total TTC</Text>
        </View>
        {vm.lines.map((l, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.cLabel}>{l.label}</Text>
            <Text style={styles.cQty}>{l.quantity}</Text>
            <Text style={styles.cPrice}>{eur(l.unitPriceHT)}</Text>
            <Text style={styles.cPrice}>{eur(l.lineTTC)}</Text>
          </View>
        ))}

        {/* Totaux */}
        <View style={styles.totals}>
          {vm.totals.vat > 0 ? (
            <>
              <Text>Total HT : {eur(vm.totals.ht)}</Text>
              {vm.vatBreakdown.map((b, i) => (
                <Text key={i} style={styles.muted}>
                  TVA {(b.rate * 100).toFixed(1)} % : {eur(b.amount)}
                </Text>
              ))}
            </>
          ) : null}
          <Text style={{ fontFamily: "Helvetica-Bold" }}>
            Total TTC : {eur(vm.totals.ttc)}
          </Text>
        </View>

        <Text style={styles.legal}>{vm.paymentTerms}</Text>
        {vm.legalMention ? <Text style={styles.legal}>{vm.legalMention}</Text> : null}
      </Page>
    </Document>
  )
}

/** Rend la facture en PDF (Buffer) à partir du view-model. À joindre à l'email. */
export function renderInvoicePdf(vm: InvoiceViewModel): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf vm={vm} />)
}
