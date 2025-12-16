"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import EditProfileForm from "./EditProfileForm";

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

  return (
    <div className="flex flex-col space-y-4">
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(!isOpen)}
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
          <div 
            id="edit-profile-form"
            className="animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <EditProfileForm
              id={id}
              firstname={firstname}
              lastname={lastname}
              image={image}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => setIsOpen(false)}
              variant="outline"
              className="w-full bg-slate-900 text-white border-black hover:bg-slate-100 transition-colors"
              aria-label="Fermer le formulaire de modification"
            >
              Annuler
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
