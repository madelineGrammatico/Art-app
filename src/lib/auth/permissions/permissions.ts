import { UserRole } from "@prisma/client";

type Permissions = (typeof PERMISSIONS)[UserRole][number]

const PERMISSIONS = {
    ADMIN: [
        "view:arts",
        "create:arts",
        "update:arts",
        "delete:arts",

        "view:basket",
        "create:basket",
        "update:basket",
        "delete:basket",
    ],
    CLIENT: [
        "view:arts",

        "view:ownBasket",
        "create:basket",
        "update:ownBasket",
        "delete:ownBasket",
    ]
} as const

export function hasPermissions(
    role:  UserRole,
    permission: Permissions
) {
    return (PERMISSIONS[role] as readonly Permissions[]).includes(permission)
}