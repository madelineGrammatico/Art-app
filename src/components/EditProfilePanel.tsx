"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import EditProfileForm from "./EditProfileForm";
import PasswordVerification from "./PasswordVerification";
import { hasPasswordAction } from "@/app/api/users/user.action";

interface EditProfilePanelProps {
  id: string;
  firstname: string | null;
  lastname: string | null;
  image: string | null;
}

export default function EditProfilePanel({
  id,
  firstname,
  lastname,
  image,
}: EditProfilePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);

  useEffect(() => {
    const checkPassword = async () => {
      const result = await hasPasswordAction(id);
      setNeedsPassword(result.hasPassword);
    };
    checkPassword();
  }, [id]);

  const handleOpen = () => {
    setIsOpen(true);
    setIsPasswordVerified(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
    setIsPasswordVerified(false);
  };

  const handlePasswordVerified = () => {
    setIsPasswordVerified(true);
  };

  const handleFormSuccess = () => {
    setIsOpen(false);
    setIsPasswordVerified(false);
  };

  return (
    <div className="flex flex-col space-y-4">
      {!isOpen && (
        <Button
          onClick={handleOpen}
          variant="outline"
          className="w-full bg-white text-black hover:bg-slate-100 transition-colors"
          aria-expanded={isOpen}
          aria-controls="edit-profile-form"
          aria-label="Ouvrir le formulaire de modification"
        >
          Modifier mon profil
        </Button>
      )}
      {isOpen && (
        <>
          {needsPassword === null && (
            <p className="text-sm text-slate-300">Vérification...</p>
          )}
          {needsPassword === true && !isPasswordVerified && (
            <PasswordVerification
              userId={id}
              onVerified={handlePasswordVerified}
              onCancel={handleCancel}
            />
          )}
          {(needsPassword === false || isPasswordVerified) && (
            <>
              <div 
                id="edit-profile-form"
                className="animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <EditProfileForm
                  id={id}
                  firstname={firstname}
                  lastname={lastname}
                  image={image}
                  onSuccess={handleFormSuccess}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="w-full bg-slate-900 text-white border-black hover:bg-slate-100 transition-colors"
                  aria-label="Fermer le formulaire de modification"
                >
                  Annuler
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
