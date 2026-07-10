import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { del } from "@vercel/blob"
import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { hasPermissions } from "@/src/lib/auth/permissions/permissions"

// Upload d'images d'œuvres (B15) : le navigateur envoie le fichier DIRECTEMENT à Vercel
// Blob (pas via une server action, qui plafonne à ~4,5 Mo — une photo d'œuvre dépasse).
// Ce route handler ne délivre qu'un JETON signé, il ne reçoit jamais le binaire.
//
// POINT SÉCURITÉ : le garde ADMIN vit dans `onBeforeGenerateToken` (phase déclenchée par
// notre form admin), PAS en tête de route — car Blob rappelle ensuite `onUploadCompleted`
// en server-to-server, sans cookie de session : un garde global bloquerait ce callback.
// Sans ce garde, n'importe quel visiteur pourrait obtenir un jeton et remplir le bucket.

const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // 15 Mo — marge confortable pour une photo haute déf.
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"]

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth()
        if (!session?.user?.role || !hasPermissions(session.user.role, "create:artworks")) {
          throw new Error("Non autorisé")
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true, // évite les collisions de nom entre œuvres.
        }
      },
      // onUploadCompleted n'est appelé qu'en prod (URL publiquement joignable) : la
      // persistance des ArtworkImage se fait de toute façon dans la server action à partir
      // des url/pathname renvoyés au client, pas ici.
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("Erreur upload image œuvre:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'upload" },
      { status: 400 }
    )
  }
}

// Suppression immédiate d'un blob (B15) : appelée quand l'admin retire, DANS le form, une
// image qu'il vient d'uploader mais qui n'est PAS encore persistée en base — sinon le
// fichier resterait orphelin (jamais référencé). À NE PAS utiliser pour une image déjà en
// base : sa suppression n'est effective qu'à la soumission (editArtworkAction), pour qu'un
// abandon du form ne détruise pas une image encore référencée.
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.role || !hasPermissions(session.user.role, "delete:artworks")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  let url: unknown
  try {
    ;({ url } = await request.json())
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }

  // Garde-fou : on ne supprime qu'une URL de NOTRE store Blob (le token est de toute façon
  // scoped, mais on rejette tôt une entrée aberrante). Parse réel du host — un simple
  // `includes` serait contournable par une URL type `https://evil.com/?x=.public.blob…/`.
  if (typeof url !== "string") {
    return NextResponse.json({ error: "URL Blob invalide" }, { status: 400 })
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: "URL Blob invalide" }, { status: 400 })
  }
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".public.blob.vercel-storage.com")) {
    return NextResponse.json({ error: "URL Blob invalide" }, { status: 400 })
  }

  try {
    await del(url)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erreur suppression blob:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de la suppression" },
      { status: 500 }
    )
  }
}
