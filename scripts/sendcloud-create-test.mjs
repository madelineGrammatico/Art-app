// Sonde de CRÉATION d'expédition v3 — PAS du code applicatif.
// Crée + annonce une expédition avec l'option GRATUITE "sendcloud:letter" (zéro
// facturation) pour découvrir la forme réelle de la réponse (id de colis, statut,
// lien d'étiquette) avant de câbler `createParcel`.
//
// ⚠️ Crée un objet RÉEL côté Sendcloud (gratuit, annulable dans le panel ou via
//    cancelParcel). Protégé par --confirm pour éviter un lancement accidentel.
//
// Lancer :
//   node --env-file=.env scripts/sendcloud-create-test.mjs --confirm

const PUBLIC = process.env.SENDCLOUD_PUBLIC_KEY
const SECRET = process.env.SENDCLOUD_SECRET_KEY

if (!PUBLIC || !SECRET) {
  console.error("❌ SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY absents du .env")
  process.exit(1)
}
if (!process.argv.includes("--confirm")) {
  console.error("⚠️  Crée une vraie expédition (gratuite). Relance avec --confirm pour confirmer.")
  process.exit(1)
}

const AUTH = "Basic " + Buffer.from(`${PUBLIC}:${SECRET}`).toString("base64")
const URL = "https://panel.sendcloud.sc/api/v3/shipments/announce-with-shipping-rules"

// Adresses de test (format FR valide). Ajuste si besoin.
const body = {
  from_address: {
    name: "Galerie Test",
    address_line_1: "10 rue de Rivoli",
    house_number: "10",
    postal_code: "75001",
    city: "Paris",
    country_code: "FR",
  },
  to_address: {
    name: "Client Test",
    address_line_1: "20 avenue des Champs-Élysées",
    house_number: "20",
    postal_code: "75008",
    city: "Paris",
    country_code: "FR",
  },
  parcels: [
    {
      dimensions: { length: "20", width: "15", height: "1", unit: "cm" },
      weight: { value: "0.1", unit: "kg" },
    },
  ],
  // Option GRATUITE → aucune facturation. C'est le levier "test" Sendcloud.
  ship_with: {
    type: "shipping_option_code",
    properties: { shipping_option_code: "sendcloud:letter" },
  },
}

const res = await fetch(URL, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  json = text
}

console.log("HTTP", res.status)
console.log(JSON.stringify(json, null, 2).slice(0, 6000))

// Repère les champs qui nous intéressent pour câbler createParcel.
const parcel = json?.data?.parcels?.[0]
if (parcel) {
  console.log("\n— Repères pour le câblage —")
  console.log("  shipment id :", json.data.id)
  console.log("  parcel id   :", parcel.id, "  ← ce sera notre shippingParcelId")
  console.log("  status      :", parcel.status?.code, parcel.status?.message ?? "")
  console.log("  label link  :", parcel.documents?.[0]?.link ?? "(aucun)")
  console.log("  tracking    :", parcel.tracking_number ?? "(aucun)")
}
