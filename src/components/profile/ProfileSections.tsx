"use client";

import ProfileSectionPanel from "./ProfileSectionPanel";
import { type ReactNode } from "react";

type ProfileUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

type SectionField = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
};

export type SectionConfig = {
  id: string;
  title: string;
  description: string;
  requiresPassword: boolean;
  fields: SectionField[];
  submitAction: (userId: string, values: Record<string, string>) => Promise<any>;
  getInitialValues: (user: ProfileUser) => Record<string, string | null>;
};

type ProfileSectionsProps = {
  user: ProfileUser;
  sections: SectionConfig[];
  renderFormForSection: (
    section: SectionConfig,
    user: ProfileUser,
    onSuccess: () => void
  ) => ReactNode;
};

export default function ProfileSections({
  user,
  sections,
  renderFormForSection,
}: ProfileSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <ProfileSectionPanel
          key={section.id}
          userId={user.id}
          title={section.title}
          description={section.description}
          requiresPassword={section.requiresPassword}
        >
          {(onSuccess) => renderFormForSection(section, user, onSuccess)}
        </ProfileSectionPanel>
      ))}
    </div>
  );
}
