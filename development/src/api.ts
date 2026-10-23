export const SESSION_REJECTED_EVENT = "ecoterra:session-rejected"

// Solo un 401 de nuestra API con token puede invalidar la sesión activa.
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  const token = new Headers(init?.headers).get("Authorization")
  if (response.status === 401 && input.startsWith("/api/") && token?.startsWith("Bearer ")) {
    window.dispatchEvent(new CustomEvent(SESSION_REJECTED_EVENT, { detail: token.slice(7) }))
  }
  return response
}
