import { AuthUser, authHeaders } from "./shared"

// Consulta el enlace del PDF, lo genera si falta y valida que el enlace obtenido use HTTP o HTTPS.
export async function getDocumentPdfUrl(base: string, user: AuthUser | null): Promise<string> {
  if (!user) throw new Error("Inicia sesión para consultar documentos.")
  const headers = authHeaders(user)
  let response = await fetch(`${base}/pdf/`, { headers, cache: "no-store" })
  if (response.status === 404) {
    const generated = await fetch(`${base}/generar-pdf/`, { method: "POST", headers })
    if (!generated.ok) {
      const error = await generated.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(error?.error || error?.detail || "No se pudo generar y almacenar el PDF.")
    }
    response = await fetch(`${base}/pdf/`, { headers, cache: "no-store" })
  }
  const data = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || data?.detail || "No se pudo consultar el PDF.")
  }
  const url = new URL(data.url, window.location.origin)
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Enlace de documento inválido.")
  return url.href
}
