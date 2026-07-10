import Image from "next/image"
import { ImageOff } from "lucide-react"

type ArtworkImageProps = {
  url: string | null | undefined
  alt: string
  // Indice de tailles pour l'optimisation responsive next/image (srcset). Défaut : pleine largeur.
  sizes?: string
  // true pour l'image « above the fold » (page œuvre) → préchargement, pas de lazy load.
  priority?: boolean
}

// Affichage d'une image d'œuvre servie depuis Vercel Blob, optimisée par next/image (B15).
// À placer dans un conteneur `relative` (utilise `fill`). Sans URL → placeholder neutre.
export function ArtworkImage({ url, alt, sizes, priority }: ArtworkImageProps) {
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-500">
        <ImageOff className="h-10 w-10" aria-hidden />
        <span className="sr-only">Pas d&apos;image disponible</span>
      </div>
    )
  }

  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes ?? "100vw"}
      className="object-cover"
      priority={priority}
    />
  )
}
