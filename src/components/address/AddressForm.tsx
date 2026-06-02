"use client"

import { useState, useTransition } from "react"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { Check, X, Building2, Truck, Plus } from "lucide-react"
import {
  createAddressAction,
  updateAddressAction,
} from "@/app/api/users/user.action"

export type AddressFormValues = {
  street: string
  postalCode: string
  city: string
  country: string
  isDefaultBilling: boolean
  isDefaultShipping: boolean
}

export type SavedAddress = {
  id: string
  userId: string
  street: string
  postalCode: string
  city: string
  country: string
  isDefaultBilling: boolean
  isDefaultShipping: boolean
  createdAt: Date
  updatedAt: Date
}

type Props = {
  userId: string
  initialValues?: AddressFormValues
  // Present = edit mode (server action will be updateAddressAction).
  // Absent = create mode (createAddressAction).
  editingId?: string
  onSuccess: (address: SavedAddress) => void
  onCancel: () => void
  // Override the default submit button label.
  submitLabel?: string
  // Suffix used in input ids to keep them unique when multiple forms render
  // on the same page (e.g. one in AddressSection + one in CheckoutPanel).
  formIdSuffix?: string
  // When true, hides both the header X and the footer "Annuler" button.
  // Used when there is no meaningful state to return to (e.g. checkout
  // empty state — user must add an address to proceed).
  hideCancel?: boolean
}

const EMPTY_VALUES: AddressFormValues = {
  street: "",
  postalCode: "",
  city: "",
  country: "",
  isDefaultBilling: false,
  isDefaultShipping: false,
}

export default function AddressForm({
  userId,
  initialValues,
  editingId,
  onSuccess,
  onCancel,
  submitLabel,
  formIdSuffix = "new",
  hideCancel = false,
}: Props) {
  const isEdit = !!editingId
  const [formData, setFormData] = useState<AddressFormValues>(
    initialValues ?? EMPTY_VALUES
  )
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateAddressAction(userId, editingId!, formData)
          : await createAddressAction(userId, formData)
        onSuccess(result as SavedAddress)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erreur lors de l'enregistrement"
        )
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          {isEdit ? (
            "Modifier l'adresse"
          ) : (
            <>
              <Plus className="w-5 h-5" />
              Nouvelle adresse
            </>
          )}
        </h4>
        {!hideCancel && (
          <Button
            type="button"
            onClick={onCancel}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={isPending}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r text-sm text-red-800 flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}

      <div>
        <Label
          htmlFor={`street-${formIdSuffix}`}
          className="text-slate-700 text-sm font-medium"
        >
          Rue *
        </Label>
        <Input
          id={`street-${formIdSuffix}`}
          type="text"
          value={formData.street}
          onChange={(e) => setFormData({ ...formData, street: e.target.value })}
          className="bg-white text-black mt-1 border-slate-300"
          required
          placeholder="Rue"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label
            htmlFor={`postalCode-${formIdSuffix}`}
            className="text-slate-700 text-sm font-medium"
          >
            Code postal *
          </Label>
          <Input
            id={`postalCode-${formIdSuffix}`}
            type="text"
            value={formData.postalCode}
            onChange={(e) =>
              setFormData({ ...formData, postalCode: e.target.value })
            }
            className="bg-white text-black mt-1 border-slate-300"
            required
            placeholder="Code postal"
          />
        </div>

        <div>
          <Label
            htmlFor={`city-${formIdSuffix}`}
            className="text-slate-700 text-sm font-medium"
          >
            Ville *
          </Label>
          <Input
            id={`city-${formIdSuffix}`}
            type="text"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            className="bg-white text-black mt-1 border-slate-300"
            required
            placeholder="Ville"
          />
        </div>
      </div>

      <div>
        <Label
          htmlFor={`country-${formIdSuffix}`}
          className="text-slate-700 text-sm font-medium"
        >
          Pays *
        </Label>
        <Input
          id={`country-${formIdSuffix}`}
          type="text"
          value={formData.country}
          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
          className="bg-white text-black mt-1 border-slate-300"
          required
          placeholder="Pays"
        />
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={formData.isDefaultBilling}
            onChange={(e) =>
              setFormData({ ...formData, isDefaultBilling: e.target.checked })
            }
            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-600" />
            <span className="text-sm text-slate-700 group-hover:text-slate-900">
              Adresse de facturation par défaut
            </span>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={formData.isDefaultShipping}
            onChange={(e) =>
              setFormData({ ...formData, isDefaultShipping: e.target.checked })
            }
            className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
          />
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-600" />
            <span className="text-sm text-slate-700 group-hover:text-slate-900">
              Adresse de livraison par défaut
            </span>
          </div>
        </label>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        {!hideCancel && (
          <Button
            type="button"
            onClick={onCancel}
            variant="outline"
            className="border-slate-300"
            disabled={isPending}
          >
            Annuler
          </Button>
        )}
        <Button
          type="submit"
          className="bg-black text-white hover:bg-slate-800"
          disabled={isPending}
        >
          <Check className="w-4 h-4 mr-2" />
          {submitLabel ?? (isEdit ? "Enregistrer" : "Ajouter l'adresse")}
        </Button>
      </div>
    </form>
  )
}
