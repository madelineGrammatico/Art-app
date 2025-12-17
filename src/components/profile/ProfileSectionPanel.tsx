"use client";

import { useEffect, useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import PasswordVerification from "../PasswordVerification";
import { hasPasswordAction } from "@/app/api/users/user.action";
import type { ReactNode } from "react";

interface ProfileSectionPanelProps {
  userId: string;
  title: string;
  description: string;
  requiresPassword?: boolean;
  children: (onSuccess: () => void) => ReactNode;
}

export default function ProfileSectionPanel({
  userId,
  title,
  description,
  requiresPassword = false,
  children,
}: ProfileSectionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);

  useEffect(() => {
    if (!requiresPassword) {
      setNeedsPassword(false);
      return;
    }

    const checkPassword = async () => {
      const result = await hasPasswordAction(userId);
      setNeedsPassword(result.hasPassword);
    };
    checkPassword();
  }, [userId, requiresPassword]);

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
    <Card className="flex flex-col p-6 bg-slate-900 text-white w-full h-fit">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-slate-300">{description}</p>
      </div>

      {!isOpen && (
        <Button
          onClick={handleOpen}
          variant="outline"
          className="mt-2 w-full bg-white text-black hover:bg-slate-100 transition-colors"
          aria-expanded={isOpen}
          aria-label={`Ouvrir la section ${title}`}
        >
          Modifier
        </Button>
      )}

      {isOpen && (
        <div className="mt-4 space-y-4">
          {requiresPassword && needsPassword === null && (
            <p className="text-sm text-slate-300">Vérification...</p>
          )}

          {requiresPassword && needsPassword === true && !isPasswordVerified && (
            <PasswordVerification
              userId={userId}
              onVerified={handlePasswordVerified}
              onCancel={handleCancel}
            />
          )}

          {(!requiresPassword || needsPassword === false || isPasswordVerified) && (
            <>
              <div
                id="profile-section-form"
                className="animate-in fade-in slide-in-from-top-2 duration-200"
              >
                {children(handleFormSuccess)}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="w-full bg-slate-900 text-white border-black hover:bg-slate-800 transition-colors"
                  aria-label={`Fermer la section ${title}`}
                >
                  Annuler
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

