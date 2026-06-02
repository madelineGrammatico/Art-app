"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import {
  deleteAddressAction,
  getUserAddressesAction,
} from "@/app/api/users/user.action";
import { MapPin, Plus, Edit2, Trash2, X, Building2, Truck } from "lucide-react";
import AddressForm, { SavedAddress } from "../address/AddressForm";

type AddressSectionProps = {
  userId: string;
  initialAddresses: SavedAddress[];
};

export default function AddressSection({
  userId,
  initialAddresses,
}: AddressSectionProps) {
  const { update } = useSession();
  const router = useRouter();
  const [addresses, setAddresses] = useState<SavedAddress[]>(initialAddresses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const refreshAfterChange = async () => {
    const updated = await getUserAddressesAction(userId);
    setAddresses(updated);
    update();
    router.refresh();
  };

  const handleFormSuccess = async () => {
    await refreshAfterChange();
    setEditingId(null);
    setIsAdding(false);
  };

  const handleFormCancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setError("");
  };

  const handleDelete = (addressId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette adresse ?")) {
      return;
    }

    setIsDeleting(addressId);
    setError("");

    startTransition(async () => {
      try {
        await deleteAddressAction(userId, addressId);
        await refreshAfterChange();
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
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
                setError("");
              }}
              className="bg-black text-white hover:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une adresse
            </Button>
          </CardContent>
        </Card>
      )}

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
              <AddressForm
                userId={userId}
                initialValues={{
                  street: address.street,
                  postalCode: address.postalCode,
                  city: address.city,
                  country: address.country,
                  isDefaultBilling: address.isDefaultBilling,
                  isDefaultShipping: address.isDefaultShipping,
                }}
                editingId={address.id}
                onSuccess={handleFormSuccess}
                onCancel={handleFormCancel}
                formIdSuffix={address.id}
              />
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
                    onClick={() => {
                      setEditingId(address.id);
                      setIsAdding(false);
                      setError("");
                    }}
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

      {isAdding && (
        <Card className="bg-white border-2 border-blue-500 shadow-lg">
          <CardContent className="p-6">
            <AddressForm
              userId={userId}
              onSuccess={handleFormSuccess}
              onCancel={handleFormCancel}
            />
          </CardContent>
        </Card>
      )}

      {addresses.length > 0 && !isAdding && editingId === null && (
        <Button
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setError("");
          }}
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
