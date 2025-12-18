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
import { MapPin, Plus, Edit2, Trash2, Check, X, Building2, Truck } from "lucide-react";
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
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r text-sm text-red-800 flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Liste des adresses */}
      {addresses.length === 0 && !isAdding && editingId === null && (
        <Card className="bg-white border-2 border-dashed border-slate-300">
          <CardContent className="p-12 text-center">
            <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">
              Aucune adresse enregistrée
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Ajoutez votre première adresse pour faciliter vos commandes
            </p>
            <Button
              onClick={startAdd}
              className="bg-black text-white hover:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une adresse
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Liste des adresses existantes */}
      {addresses.map((address) => (
        <Card
          key={address.id}
          className={`bg-white border transition-all ${
            editingId === address.id
              ? "ring-2 ring-blue-500 border-blue-500 shadow-lg"
              : "border-slate-200 hover:border-slate-300 hover:shadow-md"
          }`}
        >
          <CardContent className="p-6">
            {editingId === address.id ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-semibold text-slate-900">
                    Modifier l'adresse
                  </h4>
                  <Button
                    type="button"
                    onClick={cancelEdit}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div>
                  <Label htmlFor={`street-${address.id}`} className="text-slate-700 text-sm font-medium">
                    Rue *
                  </Label>
                  <Input
                    id={`street-${address.id}`}
                    type="text"
                    value={formData.street}
                    onChange={(e) =>
                      setFormData({ ...formData, street: e.target.value })
                    }
                    className="bg-white text-black mt-1 border-slate-300"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor={`postalCode-${address.id}`}
                      className="text-slate-700 text-sm font-medium"
                    >
                      Code postal *
                    </Label>
                    <Input
                      id={`postalCode-${address.id}`}
                      type="text"
                      value={formData.postalCode}
                      onChange={(e) =>
                        setFormData({ ...formData, postalCode: e.target.value })
                      }
                      className="bg-white text-black mt-1 border-slate-300"
                      required
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor={`city-${address.id}`}
                      className="text-slate-700 text-sm font-medium"
                    >
                      Ville *
                    </Label>
                    <Input
                      id={`city-${address.id}`}
                      type="text"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      className="bg-white text-black mt-1 border-slate-300"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label
                    htmlFor={`country-${address.id}`}
                    className="text-slate-700 text-sm font-medium"
                  >
                    Pays *
                  </Label>
                  <Input
                    id={`country-${address.id}`}
                    type="text"
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                    className="bg-white text-black mt-1 border-slate-300"
                    required
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.isDefaultBilling}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isDefaultBilling: e.target.checked,
                        })
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
                        setFormData({
                          ...formData,
                          isDefaultShipping: e.target.checked,
                        })
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
                  <Button
                    type="button"
                    onClick={cancelEdit}
                    variant="outline"
                    className="border-slate-300"
                  >
                    Annuler
                  </Button>
                  <Button type="submit" className="bg-black text-white hover:bg-slate-800">
                    <Check className="w-4 h-4 mr-2" />
                    Enregistrer
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {address.isDefaultBilling && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                          <Building2 className="w-3 h-3" />
                          Facturation par défaut
                        </span>
                      )}
                      {address.isDefaultShipping && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full">
                          <Truck className="w-3 h-3" />
                          Livraison par défaut
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-900 font-medium text-base flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-500" />
                        {address.street}
                      </p>
                      <p className="text-slate-600 text-sm ml-6">
                        {address.postalCode} {address.city}
                      </p>
                      <p className="text-slate-600 text-sm ml-6">{address.country}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <Button
                    onClick={() => startEdit(address)}
                    variant="outline"
                    className="flex-1 border-slate-300 hover:bg-slate-50"
                    size="sm"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Modifier
                  </Button>
                  <Button
                    onClick={() => handleDelete(address.id)}
                    variant="outline"
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    size="sm"
                    disabled={isDeleting === address.id}
                  >
                    {isDeleting === address.id ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                        Suppression...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Formulaire d'ajout */}
      {isAdding && (
        <Card className="bg-white border-2 border-blue-500 shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Nouvelle adresse
                </h4>
                <Button
                  type="button"
                  onClick={cancelEdit}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div>
                <Label htmlFor="street-new" className="text-slate-700 text-sm font-medium">
                  Rue *
                </Label>
                <Input
                  id="street-new"
                  type="text"
                  value={formData.street}
                  onChange={(e) =>
                    setFormData({ ...formData, street: e.target.value })
                  }
                  className="bg-white text-black mt-1 border-slate-300"
                  required
                  placeholder="123 Rue de la République"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="postalCode-new"
                    className="text-slate-700 text-sm font-medium"
                  >
                    Code postal *
                  </Label>
                  <Input
                    id="postalCode-new"
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) =>
                      setFormData({ ...formData, postalCode: e.target.value })
                    }
                    className="bg-white text-black mt-1 border-slate-300"
                    required
                    placeholder="75001"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="city-new"
                    className="text-slate-700 text-sm font-medium"
                  >
                    Ville *
                  </Label>
                  <Input
                    id="city-new"
                    type="text"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="bg-white text-black mt-1 border-slate-300"
                    required
                    placeholder="Paris"
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="country-new"
                  className="text-slate-700 text-sm font-medium"
                >
                  Pays *
                </Label>
                <Input
                  id="country-new"
                  type="text"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                  className="bg-white text-black mt-1 border-slate-300"
                  required
                  placeholder="France"
                />
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.isDefaultBilling}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isDefaultBilling: e.target.checked,
                      })
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
                      setFormData({
                        ...formData,
                        isDefaultShipping: e.target.checked,
                      })
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
                <Button
                  type="button"
                  onClick={cancelEdit}
                  variant="outline"
                  className="border-slate-300"
                >
                  Annuler
                </Button>
                <Button type="submit" className="bg-black text-white hover:bg-slate-800">
                  <Check className="w-4 h-4 mr-2" />
                  Ajouter l'adresse
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Bouton d'ajout quand il y a déjà des adresses */}
      {addresses.length > 0 && !isAdding && editingId === null && (
        <Button
          onClick={startAdd}
          variant="outline"
          className="w-full border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une autre adresse
        </Button>
      )}
    </div>
  );
}

