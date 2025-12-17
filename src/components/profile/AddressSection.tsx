"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  createAddressAction,
  updateAddressAction,
  deleteAddressAction,
  getUserAddressesAction,
} from "@/app/api/users/user.action";
type PostalAddress = {
  id: string;
  userId: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AddressSectionProps = {
  userId: string;
  initialAddresses: PostalAddress[];
};

export default function AddressSection({
  userId,
  initialAddresses,
}: AddressSectionProps) {
  const { update } = useSession();
  const router = useRouter();
  const [addresses, setAddresses] = useState<PostalAddress[]>(initialAddresses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    street: "",
    postalCode: "",
    city: "",
    country: "",
    isDefaultBilling: false,
    isDefaultShipping: false,
  });

  const resetForm = () => {
    setFormData({
      street: "",
      postalCode: "",
      city: "",
      country: "",
      isDefaultBilling: false,
      isDefaultShipping: false,
    });
    setError("");
  };

  const startEdit = (address: PostalAddress) => {
    setEditingId(address.id);
    setFormData({
      street: address.street,
      postalCode: address.postalCode,
      city: address.city,
      country: address.country,
      isDefaultBilling: address.isDefaultBilling,
      isDefaultShipping: address.isDefaultShipping,
    });
    setIsAdding(false);
    setError("");
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    resetForm();
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        if (editingId) {
          // Mise à jour
          await updateAddressAction(userId, editingId, formData);
        } else {
          // Création
          await createAddressAction(userId, formData);
        }

        // Rafraîchir la liste des adresses
        const updatedAddresses = await getUserAddressesAction(userId);
        setAddresses(updatedAddresses);
        update();
        router.refresh();

        // Réinitialiser le formulaire
        cancelEdit();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erreur lors de l'enregistrement"
        );
      }
    });
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette adresse ?")) {
      return;
    }

    setIsDeleting(addressId);
    setError("");

    startTransition(async () => {
      try {
        await deleteAddressAction(userId, addressId);
        const updatedAddresses = await getUserAddressesAction(userId);
        setAddresses(updatedAddresses);
        update();
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erreur lors de la suppression"
        );
      } finally {
        setIsDeleting(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold mb-1">Adresses postales</h3>
          <p className="text-sm text-slate-300">
            Gérez vos adresses de facturation et de livraison.
          </p>
        </div>
        {!isAdding && editingId === null && (
          <Button
            onClick={startAdd}
            variant="outline"
            className="bg-white text-black hover:bg-slate-100"
          >
            + Ajouter une adresse
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-500 rounded text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Formulaire d'ajout/modification */}
      {(isAdding || editingId !== null) && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="street" className="text-white text-sm font-medium">
                  Rue
                </Label>
                <Input
                  id="street"
                  type="text"
                  value={formData.street}
                  onChange={(e) =>
                    setFormData({ ...formData, street: e.target.value })
                  }
                  className="bg-white text-black mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="postalCode"
                    className="text-white text-sm font-medium"
                  >
                    Code postal
                  </Label>
                  <Input
                    id="postalCode"
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) =>
                      setFormData({ ...formData, postalCode: e.target.value })
                    }
                    className="bg-white text-black mt-1"
                    required
                  />
                </div>

                <div>
                  <Label
                    htmlFor="city"
                    className="text-white text-sm font-medium"
                  >
                    Ville
                  </Label>
                  <Input
                    id="city"
                    type="text"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="bg-white text-black mt-1"
                    required
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="country"
                  className="text-white text-sm font-medium"
                >
                  Pays
                </Label>
                <Input
                  id="country"
                  type="text"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                  className="bg-white text-black mt-1"
                  required
                />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDefaultBilling}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isDefaultBilling: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-white">
                    Adresse de facturation par défaut
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDefaultShipping}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isDefaultShipping: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-white">
                    Adresse de livraison par défaut
                  </span>
                </label>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  onClick={cancelEdit}
                  variant="outline"
                  className="bg-slate-900 text-white border-black hover:bg-slate-800"
                >
                  Annuler
                </Button>
                <Button type="submit" variant="destructive">
                  {editingId ? "Enregistrer" : "Ajouter"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste des adresses */}
      {addresses.length === 0 && !isAdding && editingId === null && (
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-6 text-center text-slate-400">
            Aucune adresse enregistrée
          </CardContent>
        </Card>
      )}

      {addresses.map((address) => (
        <Card
          key={address.id}
          className={`bg-slate-900 border-slate-700 ${
            editingId === address.id ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <CardContent className="p-6">
            {editingId === address.id ? (
              <div className="text-sm text-slate-400">
                Mode édition activé (voir formulaire ci-dessus)
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex gap-2 mb-2">
                      {address.isDefaultBilling && (
                        <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
                          Facturation
                        </span>
                      )}
                      {address.isDefaultShipping && (
                        <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">
                          Livraison
                        </span>
                      )}
                    </div>
                    <p className="text-white font-medium">{address.street}</p>
                    <p className="text-slate-300">
                      {address.postalCode} {address.city}
                    </p>
                    <p className="text-slate-300">{address.country}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => startEdit(address)}
                    variant="outline"
                    className="flex-1 bg-white text-black hover:bg-slate-100"
                    size="sm"
                  >
                    Modifier
                  </Button>
                  <Button
                    onClick={() => handleDelete(address.id)}
                    variant="destructive"
                    className="flex-1"
                    size="sm"
                    disabled={isDeleting === address.id}
                  >
                    {isDeleting === address.id ? "Suppression..." : "Supprimer"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
