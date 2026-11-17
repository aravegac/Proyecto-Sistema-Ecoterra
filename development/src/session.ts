import type { AuthUser } from "./shared"

const SESSION_KEY = "ecoterra.auth.session"
const SESSION_DURATION = 8 * 60 * 60 * 1000

export function readSession(): AuthUser | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) return null
    const { user, expiresAt } = JSON.parse(stored)
    if (
      typeof expiresAt === "number" &&
      expiresAt > Date.now() &&
      typeof user?.id === "number" &&
      typeof user.nombre === "string" &&
      typeof user.email === "string" &&
      typeof user.id_rol === "number" &&
      typeof user.token === "string" &&
      user.token.length > 0
    ) {
      return user
    }
    clearSession()
  } catch {
    // Un almacenamiento bloqueado o dañado no debe impedir abrir el login.
    clearSession()
  }
  return null
}

export function saveSession(user: AuthUser): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ user, expiresAt: Date.now() + SESSION_DURATION }),
    )
  } catch {
    // Si el navegador bloquea el almacenamiento, la sesión sigue en memoria.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // El cierre de sesión en memoria debe funcionar incluso sin almacenamiento.
  }
}
