export function sessionFor(args: {
  id: string
  email?: string | null
  role?: "ADMIN" | "CLIENT"
}) {
  return {
    user: {
      id: args.id,
      email: args.email ?? `${args.id}@test.local`,
      role: args.role ?? "CLIENT",
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}
