import { UserRole } from "@prisma/client";

type Permissions = (typeof PERMISSIONS)[UserRole][number]

const PERMISSIONS = {
    ADMIN: [
        "view:artworks",
        "create:artworks",
        "update:artworks",
        "delete:artworks",

        "view:certificate",
        "create:certificate",
        "update:certificate",
        "delete:certificate",

        "view:invoice",
        "create:invoice",
        "update:invoice",
        "delete:invoice",

        "view:purchase",
        "create:purchase",
        "update:purchase",
        "delete:purchase",

        "view:basket",
        "create:basket",
        "update:basket",
        "delete:basket",
    ],
    CLIENT: [
        "view:ownCertificate",
        "create:certificate",

        "view:ownInvoice",
        "create:invoice",

        "view:ownPurchase",
        "create:purchase",
        "update:ownPurchase",
        "delete:ownPurchase",

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