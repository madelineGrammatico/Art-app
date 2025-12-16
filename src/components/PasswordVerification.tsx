"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "@radix-ui/react-label";
import { verifyPasswordAction } from "@/app/api/users/user.action";

interface PasswordVerificationProps {
  userId: string;
  onVerified: () => void;
  onCancel: () => void;
}

export default function PasswordVerification({
  userId,
  onVerified,
  onCancel,
}: PasswordVerificationProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [passwordError, setPasswordError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setIsVerifying(true);

    const passwordValue = passwordRef.current?.value || "";

    try {
      await verifyPasswordAction(userId, passwordValue);
      // Réinitialiser immédiatement le champ après utilisation
      if (passwordRef.current) {
        passwordRef.current.value = "";
      }
      onVerified();
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Erreur lors de la vérification du mot de passe"
      );
      // Réinitialiser le champ même en cas d'erreur
      if (passwordRef.current) {
        passwordRef.current.value = "";
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <form onSubmit={handlePasswordSubmit} className="space-y-4">
      <Label className="text-white text-sm font-medium">
        Confirmez votre mot de passe pour continuer
        <Input
          ref={passwordRef}
          type="password"
          className="bg-white text-black mt-1"
          placeholder="Entrez votre mot de passe"
          required
          disabled={isVerifying}
        />
      </Label>
      {passwordError && (
        <p className="text-sm text-red-400">{passwordError}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isVerifying}
          variant="outline"
          className="bg-white text-black hover:bg-slate-100"
        >
          {isVerifying ? "Vérification..." : "Vérifier"}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
          className="bg-slate-900 text-white border-black hover:bg-slate-800"
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
