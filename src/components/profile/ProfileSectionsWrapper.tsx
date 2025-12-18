"use client";

import ProfileSections, { type SectionConfig } from "./ProfileSections";
import ProfileForm from "./ProfileForm";
import {
  updateUserAction,
  updateUserEmailAction,
  changePasswordAction,
} from "@/app/api/users/user.action";

type ProfileUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
};

const sections: SectionConfig[] = [
  {
    id: "avatar",
    title: "Modifier mon avatar",
    description: "Photo, prénom et nom visibles sur votre profil.",
    requiresPassword: true,
    fields: [
      { name: "image", label: "Image", type: "text" },
      { name: "firstName", label: "Prénom", type: "text" },
      { name: "lastName", label: "Nom", type: "text" },
    ],
    submitAction: async (userId, values) => {
      return updateUserAction(userId, {
        firstName: values.firstName,
        lastName: values.lastName,
        image: values.image,
      });
    },
    getInitialValues: (user) => ({
      image: user.image ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    }),
  },
  {
    id: "email",
    title: "Modifier mon adresse email",
    description: "Adresse utilisée pour vous connecter et recevoir les notifications.",
    requiresPassword: true,
    fields: [{ name: "email", label: "Email", type: "email" }],
    submitAction: async (userId: string, values: Record<string, string>) => {
      return updateUserEmailAction(userId, values.email);
    },
    getInitialValues: (user: ProfileUser) => ({
      email: user.email ?? "",
    }),
  },
  {
    id: "password",
    title: "Modifier mon mot de passe",
    description: "Sécurisez l'accès à votre compte.",
    requiresPassword: true,
    fields: [
      { name: "currentPassword", label: "Mot de passe actuel", type: "password" },
      { name: "newPassword", label: "Nouveau mot de passe", type: "password" },
      {
        name: "confirmNewPassword",
        label: "Confirmer le nouveau mot de passe",
        type: "password",
      },
    ],
    submitAction: async (userId: string, values: Record<string, string>) => {
      return changePasswordAction(userId, values.currentPassword, values.newPassword);
    },
    getInitialValues: () => ({
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    }),
  },
];

type ProfileSectionsWrapperProps = {
  user: ProfileUser;
};

export default function ProfileSectionsWrapper({
  user,
}: ProfileSectionsWrapperProps) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileSections
        user={user}
        sections={sections}
        renderFormForSection={(section, currentUser, onSuccess) => {
          return (
            <ProfileForm
              userId={currentUser.id}
              fields={section.fields}
              initialValues={section.getInitialValues(currentUser)}
              submitAction={section.submitAction}
              onSuccess={onSuccess}
            />
          );
        }}
      />
    </div>
  );
}
