// Vérification ponctuelle du compte Sendcloud — PAS du code applicatif.
// But : confirmer que les clés sont valides + des transporteurs sont activés,
// et inspecter la FORME réelle des réponses avant de câbler `sendcloudClient`.
// N'expédie rien, ne crée aucune étiquette (appels lecture seule uniquement).
//
// Lancer (Node 20.6+ pour --env-file) :
//   node --env-file=.env scripts/sendcloud-check.mjs
//
// Variante test de devis (poids/itinéraire) :
//   node --env-file=.env scripts/sendcloud-check.mjs --weight 5 --from FR --to FR

const PUBLIC = process.env.SENDCLOUD_PUBLIC_KEY
const SECRET = process.env.SENDCLOUD_SECRET_KEY

if (!PUBLIC || !SECRET) {
  console.error("❌ SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY absents du .env")
  process.exit(1)
}

// Basic Auth : username = public key, password = secret key (doc Sendcloud).
const AUTH = "Basic " + Buffer.from(`${PUBLIC}:${SECRET}`).toString("base64")
const BASE = "https://panel.sendcloud.sc/api/v2"

// Petit parseur d'args --weight/--from/--to.
const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const weight = arg("weight", "5")
const fromCountry = arg("from", "FR")
const toCountry = arg("to", "FR")

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

// POST brut vers une URL absolue (pour sonder l'API v3).
async function post(url, body) {
  const res = await fetch(url, {
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
  return { status: res.status, json }
}

async function main() {
  console.log("→ 1. Transporteurs / méthodes d'expédition activés (GET /shipping_methods)")
  const methods = await get("/shipping_methods")
  console.log("   HTTP", methods.status)
  if (methods.status !== 200) {
    console.error("   ❌ Échec — clés invalides ou v2 indisponible. Réponse :")
    console.error(JSON.stringify(methods.json, null, 2))
    process.exit(1)
  }
  const list = methods.json?.shipping_methods ?? []
  console.log(`   ✅ ${list.length} méthode(s) trouvée(s) :`)
  for (const m of list.slice(0, 15)) {
    console.log(`      - id=${m.id}  "${m.name}"  carrier=${m.carrier}  min/max=${m.min_weight}-${m.max_weight}kg`)
  }
  if (list.length === 0) {
    console.warn("   ⚠️  Aucune méthode : active des transporteurs dans Settings → Carriers.")
    return
  }

  // Devis v2 sur un VRAI transporteur (pas "sendcloud"/letter) dont la tranche de
  // poids contient le poids testé — pour confirmer qu'un prix réel revient.
  const W = Number(weight)
  const real = list.find(
    (m) =>
      m.carrier !== "sendcloud" &&
      Number(m.min_weight) <= W &&
      W <= Number(m.max_weight)
  )
  if (!real) {
    console.warn(
      `\n→ 2. Aucun vrai transporteur ne couvre ${W}kg. Relance avec --weight dans une tranche existante (ex. 0.9).`
    )
  } else {
    console.log(
      `\n→ 2. Devis v2 (GET /shipping-price) méthode ${real.id} "${real.name}" (${real.carrier}) — ${W}kg ${fromCountry}→${toCountry}`
    )
    const price = await get(
      `/shipping-price?shipping_method_id=${real.id}&weight=${W}&weight_unit=kilogram&from_country=${fromCountry}&to_country=${toCountry}`
    )
    console.log("   HTTP", price.status)
    console.log(JSON.stringify(price.json, null, 2))
  }

  // Sonde l'API v3 « shipping options » : découvre la vraie forme (offres + prix +
  // sélection par tranche de poids automatique). Le corps est une hypothèse —
  // si 400, la réponse liste en général les champs requis (donc instructif quand même).
  console.log(`\n→ 3. Sonde v3 (POST /api/v3/shipping-options) — ${W}kg ${fromCountry}→${toCountry}`)
  const v3 = await post("https://panel.sendcloud.sc/api/v3/shipping-options", {
    calculate_quotes: true, // ← indispensable pour peupler quotes[].price
    from_address: { country_code: fromCountry, postal_code: "75001", city: "Paris" },
    to_address: { country_code: toCountry, postal_code: "75016", city: "Paris" },
    parcels: [
      {
        weight: { value: String(W), unit: "kg" },
        dimensions: { length: "30", width: "20", height: "10", unit: "cm" },
      },
    ],
  })
  console.log("   HTTP", v3.status)

  // Étape 4 : applique le MÊME filtrage que getShippingRates (home-delivery tarifé)
  // pour voir ce que le checkout proposerait réellement.
  const options = v3.json?.data ?? []
  const rates = []
  for (const opt of options) {
    if (opt.requirements?.is_service_point_required) continue
    if (opt.carrier?.code === "sendcloud") continue
    const total = opt.quotes?.[0]?.price?.total
    if (!opt.code || !total?.value) continue
    rates.push({
      shippingMethodId: opt.code,
      label: opt.name,
      priceHTCents: Math.round(Number(total.value) * 100),
    })
  }
  console.log(`\n→ 4. Offres home-delivery tarifées (ce que verrait le checkout) : ${rates.length}`)
  for (const r of rates) {
    console.log(`      - ${r.label}  [${r.shippingMethodId}]  ${(r.priceHTCents / 100).toFixed(2)} €`)
  }
  console.log(
    `   (total offres brutes renvoyées : ${options.length} ; filtrées : point relais + transporteur de test + sans prix)`
  )
}

main().catch((err) => {
  console.error("❌ Erreur :", err)
  process.exit(1)
})
