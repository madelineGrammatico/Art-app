"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Label } from "@radix-ui/react-label";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
};

type ProfileFormProps = {
  userId: string;
  fields: Field[];
  initialValues: Record<string, string | null>;
  submitAction: (userId: string, values: Record<string, string>) => Promise<any>;
  onSuccess?: () => void;
};

export default function ProfileForm({
  userId,
  fields,
  initialValues,
  submitAction,
  onSuccess,
}: ProfileFormProps) {
  const { update } = useSession();
  const router = useRouter();
  
  // Initialiser les states pour tous les champs
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((field) => {
      initial[field.name] = initialValues[field.name] ?? "";
    });
    return initial;
  });
  
  const [error, setError] = useState("");

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // Validation spéciale pour le mot de passe
    if (values.confirmNewPassword !== undefined) {
      if (values.newPassword !== values.confirmNewPassword) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      if (values.newPassword.length < 3) {
        setError("Le mot de passe doit contenir au moins 3 caractères");
        return;
      }
    }

    startTransition(async () => {
      try {
        // Exclure confirmNewPassword de l'objet values envoyé à l'action
        const valuesToSubmit = { ...values };
        if (valuesToSubmit.confirmNewPassword !== undefined) {
          delete valuesToSubmit.confirmNewPassword;
        }

        const result = await submitAction(userId, valuesToSubmit);
        if (result) {
          update();
          router.refresh();
          onSuccess?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col space-y-4 py-2">
      {fields.map((field) => (
        <Label key={field.name} className="text-white text-sm font-medium">
          {field.label}
          <Input
            type={field.type}
            value={values[field.name] || ""}
            className="bg-white text-black mt-1"
            onChange={(e) => handleChange(field.name, e.target.value)}
            required
          />
        </Label>
      ))}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" variant="destructive" className="mt-2">
        Enregistrer
      </Button>
    </form>
  );
}
