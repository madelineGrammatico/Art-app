'use client'

import { upload } from '@vercel/blob/client'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Image from 'next/image'
import { useState } from 'react'
import { GripVertical, Star, Trash2 } from 'lucide-react'

// Une image telle que manipulée dans le form (déjà uploadée dans Blob). `key` est un id
// stable côté client pour le D&D et les listes React (l'id DB n'existe pas encore à la
// création). L'ordre du tableau = ordre d'affichage ; la position est dérivée à la soumission.
// `persisted` = déjà en base : sa suppression est différée à la soumission (une image encore
// référencée ne doit pas disparaître si l'admin abandonne le form) ; une image uploadée cette
// session (persisted=false) est supprimée immédiatement du Blob au retrait (anti-orphelin).
export type FormImage = {
  key: string
  url: string
  pathname: string
  isPrimary: boolean
  persisted: boolean
}

function SortableThumb({
  img,
  onPrimary,
  onRemove,
}: {
  img: FormImage
  onPrimary: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: img.key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative h-28 w-28 overflow-hidden rounded-md border-2 border-slate-300 bg-slate-800"
    >
      <Image src={img.url} alt="" fill sizes="7rem" className="object-cover" />

      {img.isPrimary && (
        <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[10px] font-bold text-black">
          Principale
        </span>
      )}

      {/* Poignée de drag : les listeners ne sont QUE sur ce bouton → les clics sur les
          boutons primaire/supprimer ne sont pas capturés par le drag. */}
      <button
        type="button"
        aria-label="Réordonner"
        className="absolute right-1 top-1 cursor-grab rounded bg-black/60 p-0.5 text-white"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 py-0.5">
        <button
          type="button"
          onClick={onPrimary}
          aria-label="Définir comme image principale"
          className={img.isPrimary ? 'text-amber-400' : 'text-white'}
        >
          <Star className="h-4 w-4" fill={img.isPrimary ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Retirer cette image"
          className="text-white hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function ArtworkImagesField({
  value,
  onChange,
  onUploadingChange,
}: {
  value: FormImage[]
  onChange: (images: FormImage[]) => void
  // Remonte l'état d'upload au form parent → il désactive la soumission tant qu'un upload
  // est en cours (sinon l'œuvre serait enregistrée sans l'image en vol, blob orphelin).
  onUploadingChange?: (uploading: boolean) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Contrainte de distance : un simple clic sur la poignée ne déclenche pas un drag parasite.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Garantit qu'il y a toujours exactement une primaire dès qu'il reste ≥ 1 image
  // (miroir de l'invariant serveur — évite un état UI sans primaire après suppression).
  const withPrimary = (imgs: FormImage[]): FormImage[] => {
    if (imgs.length === 0) return imgs
    if (imgs.some((i) => i.isPrimary)) return imgs
    return imgs.map((i, idx) => ({ ...i, isPrimary: idx === 0 }))
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    onUploadingChange?.(true)
    setError(null)
    try {
      const uploaded: FormImage[] = []
      for (const file of Array.from(files)) {
        // Upload direct navigateur → Blob ; /api/artworks/upload ne délivre que le jeton
        // (garde ADMIN). Contourne la limite de corps des server actions (~4,5 Mo).
        const blob = await upload(`artworks/${file.name}`, file, {
          access: 'public',
          handleUploadUrl: '/api/artworks/upload',
        })
        uploaded.push({
          key: crypto.randomUUID(),
          url: blob.url,
          pathname: blob.pathname,
          isPrimary: false,
          persisted: false, // pas encore en base → suppression immédiate si retirée.
        })
      }
      onChange(withPrimary([...value, ...uploaded]))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'upload")
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = value.findIndex((i) => i.key === active.id)
    const newIndex = value.findIndex((i) => i.key === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(value, oldIndex, newIndex))
  }

  function setPrimary(key: string) {
    onChange(value.map((i) => ({ ...i, isPrimary: i.key === key })))
  }

  function remove(key: string) {
    const target = value.find((i) => i.key === key)
    // Image uploadée cette session mais pas encore persistée → supprimer le blob tout de
    // suite (anti-orphelin). Best-effort : si l'appel échoue, on retire quand même de l'UI.
    // Une image déjà en base (persisted) n'est PAS supprimée ici : editArtworkAction s'en
    // charge à la soumission → un abandon du form ne détruit pas une image référencée.
    if (target && !target.persisted) {
      void fetch("/api/artworks/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.url }),
      }).catch(() => {})
    }
    onChange(withPrimary(value.filter((i) => i.key !== key)))
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-black">Images de l&apos;œuvre</p>
      <p className="-mt-1 text-xs text-black/70">
        Glissez-déposez pour réordonner. L&apos;étoile définit l&apos;image principale
        (vignette de la galerie).
      </p>

      <input
        type="file"
        accept="image/*"
        multiple
        disabled={uploading}
        onChange={(e) => handleFiles(e.target.files)}
        className="text-sm text-black"
      />
      {uploading && <p className="text-sm text-black">Upload en cours…</p>}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      {value.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value.map((i) => i.key)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-3 pt-1">
              {value.map((img) => (
                <SortableThumb
                  key={img.key}
                  img={img}
                  onPrimary={() => setPrimary(img.key)}
                  onRemove={() => remove(img.key)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
