// src/modules/NotasCredito.tsx
import React, { useEffect, useState } from "react"
import { Badge, fmtCLP, I, Ico, PageTitle, authHeaders, AuthUser } from "../shared"

// Tipo ajustado a lo que devuelve el backend
type CreditNote = {
  id: number
  numero_nc: string
  factura_numero: string
  cliente_nombre: string
  fecha_emision: string
  subtotal: number
  iva: number
  total: number
  motivo: string
  estado: string
  ruta_pdf_nc: string
}

// Carga las notas de crédito y permite emitirlas sobre una factura y abrir su vista de impresión.
export default function NotasCredito({
  facturas,
  authUser,
}: {
  facturas: { id: string; cliente: string; total: number; id_interno?: number }[]
  authUser: AuthUser | null
}) {
  const [showNew, setShowNew] = useState(false)

  // Estados para la lista de notas
  const [notes, setNotes] = useState<CreditNote[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState("")

  // Estados para el formulario de nueva NC
  const [selectedFacturaId, setSelectedFacturaId] = useState("")
  const [motivo, setMotivo] = useState("")
  const [estado, setEstado] = useState("EMITIDA")
  const [subtotalInput, setSubtotalInput] = useState<number | "">("")
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState("")
  const facturaSeleccionada = facturas.find(/* Identifica el elemento buscado evaluando f.id === selectedFacturaId. */ f => f.id === selectedFacturaId)
    

  // Cargar notas desde la API al montar el componente o si cambia el usuario
  useEffect(/* Carga las notas de crédito al cambiar la sesión y finaliza la carga si no hay usuario. */ () => {
    if (!authUser) {
      setCargando(false)
      return
    }

    // Consulta las notas de crédito de la API y actualiza el listado y los indicadores de carga y error.
    const cargarNotas = async () => {
      try {
        const res = await fetch("/api/notas-credito/", {
          method: "GET",
          headers: authHeaders(authUser),
        })
        if (!res.ok) throw new Error("Error al cargar las notas de crédito.")
        const data = await res.json()
        setNotes(data)
      } catch (err: any) {
        setErrorCarga(err.message)
      } finally {
        setCargando(false)
      }
    }

    cargarNotas()
  }, [authUser])

  // Cálculos automáticos para el formulario
  const subtotalNum = Number(subtotalInput) || 0
  const ivaCalculado = Math.round(subtotalNum * 0.19)
  const totalCalculado = subtotalNum + ivaCalculado

  // Función para guardar la nueva NC
  // Valida sesión y formulario, emite la nota de crédito en la API y actualiza la lista local.
  const handleEmitirNC = async () => {
    if (!authUser) {
      setErrorGuardado("No hay sesión activa.")
      return
    }
    if (!selectedFacturaId || !motivo || subtotalInput === "" || subtotalNum <= 0) {
      setErrorGuardado("Completa todos los campos obligatorios con valores válidos.")
      return
    }

    setGuardando(true)
    setErrorGuardado("")

    try {
      const res = await fetch("/api/notas-credito/", {
        method: "POST",
        headers: authHeaders(authUser),
        body: JSON.stringify({
          // Buscamos la factura seleccionada y usamos su id_interno
          id_factura: facturas.find(/* Identifica el elemento buscado evaluando f.id === selectedFacturaId. */ f => f.id === selectedFacturaId)?.id_interno,
          numero_nc: `NC-${Date.now()}`, // Generación temporal
          fecha_emision: new Date().toISOString().split("T")[0],
          motivo: motivo,
          estado: estado,
          subtotal_bruto: subtotalNum,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
        throw new Error(
          errData ? JSON.stringify(errData) : "Error al crear la nota de crédito."
        )
      }

      const nuevaNC = await res.json()
      setNotes(/* Calcula el nuevo valor de Notes devolviendo [nuevaNC, ...prev]. */ (prev) => [nuevaNC, ...prev])
      
      // Limpiar formulario y cerrar modal
      setShowNew(false)
      setSelectedFacturaId("")
      setMotivo("")
      setSubtotalInput("")
      setEstado("EMITIDA")
      setErrorGuardado("")
    } catch (err: any) {
      setErrorGuardado(err.message)
    } finally {
      setGuardando(false)
    }
  }

  // Abre una ventana con el comprobante HTML de la nota de crédito para imprimirlo.
  const downloadCreditNotePdf = async (note: CreditNote) => {
    const tab = window.open("about:blank", "_blank")
    if (!tab) {
      alert("Permite las ventanas emergentes para abrir el PDF.")
      return
    }
    if (!authUser) {
      tab.close()
      alert("Tu sesión ha expirado. Inicia sesión nuevamente.")
      return
    }

    tab.document.title = `Nota de Crédito ${note.numero_nc}`
    tab.opener = null
    tab.document.body.textContent = "Cargando PDF..."

    try {
      // 1. Intentar obtener el PDF existente
      let res = await fetch(`/api/notas-credito/${note.id}/pdf/`, {
        headers: authHeaders(authUser),
      })

      // 2. Si no existe (404), generarlo
      if (!res.ok && res.status === 404) {
        const genRes = await fetch(`/api/notas-credito/${note.id}/generar-pdf/`, {
          method: "POST",
          headers: authHeaders(authUser),
        })
        if (!genRes.ok) throw new Error("No se pudo generar el PDF.")
        
        // Volver a pedir la URL ahora que ya está generado
        res = await fetch(`/api/notas-credito/${note.id}/pdf/`, {
          headers: authHeaders(authUser),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || "Error al obtener el PDF.")
      }

      const data = await res.json()
      tab.location.href = data.url
    } catch (error) {
      tab.close()
      alert(error instanceof Error ? error.message : "No se pudo abrir el PDF.")
    }
  }

  return (
    <div>
      <PageTitle
        title="Notas de Crédito"
        sub="Documentos asociados a facturas emitidas"
      >
        <button className="btn btn-primary" onClick={/* Ejecuta setShowNew(true) al invocarse este callback. */ () => setShowNew(true)}>
          <Ico p={I.plus} size={14} /> Nueva NC
        </button>
      </PageTitle>
      <div className="panel">
        <table className="dt w-full">
          <thead>
            <tr>
              <th>N° NC</th>
              <th>Factura Origen</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Subtotal</th>
              <th>IVA</th>
              <th>Total</th>
              <th>Motivo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 20 }}>
                  Cargando notas de crédito...
                </td>
              </tr>
            ) : errorCarga ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 20, color: "red" }}>
                  {errorCarga}
                </td>
              </tr>
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 20 }}>
                  No hay notas de crédito registradas.
                </td>
              </tr>
            ) : (
              notes.map(/* Renderiza el contenido de cada elemento de notes. */ (note) => (
                <tr key={note.id}>
                  <td className="nc-id">{note.numero_nc}</td>
                  <td className="nc-factura">{note.factura_numero}</td>
                  <td className="nc-cliente">{note.cliente_nombre}</td>
                  <td>{note.fecha_emision}</td>
                  {/* Mostramos en negativo para mantener el diseño original */}
                  <td>{fmtCLP(note.subtotal)}</td> 
                  <td>{fmtCLP(note.iva)}</td> 
                  <td className="nc-monto">{fmtCLP(note.total)}</td> 
                  <td>{note.motivo}</td>
                  <td>
                    <select
                      className="select"
                      value={note.estado}
                      onChange={async (e) => {
                        const nuevoEstado = e.target.value
                        // Actualizar visualmente de inmediato
                        setNotes((prev) =>
                          prev.map((n) => (n.id === note.id ? { ...n, estado: nuevoEstado } : n))
                        )
                        // Enviar al backend
                        try {
                          if (!authUser) throw new Error("Sin sesión")
                          const res = await fetch(`/api/notas-credito/${note.id}/estado/`, {
                            method: "PATCH",
                            headers: authHeaders(authUser),
                            body: JSON.stringify({ estado: nuevoEstado }),
                          })
                          if (!res.ok) throw new Error("No se pudo actualizar")
                        } catch (err) {
                          alert("Error al actualizar el estado. Se revertirá.")
                          // Revertir si falla
                          setNotes((prev) =>
                            prev.map((n) => (n.id === note.id ? { ...n, estado: note.estado } : n))
                          )
                        }
                      }}
                      style={{ width: "auto", fontSize: "0.75rem" }}
                    >
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="EMITIDA">Emitida</option>
                      <option value="ANULADA">Anulada</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Ver PDF"
                      onClick={/* Ejecuta downloadCreditNotePdf(note) al invocarse este callback. */ () => downloadCreditNotePdf(note)}
                    >
                      <Ico p={I.pdf} size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showNew && (
        <div className="modal-backdrop" onClick={/* Ejecuta setShowNew(false) al invocarse este callback. */ () => setShowNew(false)}>
          <div
            className="modal nc-modal"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="nc-modal-header">
              <h2 className="nc-modal-title">
                Nueva Nota de Crédito
              </h2>
              <button onClick={/* Ejecuta setShowNew(false) al invocarse este callback. */ () => setShowNew(false)} className="nc-modal-close">
                <Ico p={I.x} size={18} />
              </button>
            </div>
            <div className="nc-form-stack">
              <div className="field">
                <label className="label">Factura de Origen *</label>
                <select 
                  className="select"
                  value={selectedFacturaId}
                  onChange={/* Selecciona la factura y completa el subtotal inicial de la nota de crédito. */ (e) => {
                    setSelectedFacturaId(e.target.value)
                    // Autocompletar el subtotal con el total de la factura
                    const fac = facturas.find(/* Identifica el elemento buscado evaluando f.id === e.target.value. */ f => f.id === e.target.value)
                    if (fac) setSubtotalInput(fac.total)
                  }}
                >
                  <option value="">Seleccionar factura…</option>
                  {facturas.map(/* Renderiza el contenido de cada elemento de facturas. */ (invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.id} · {invoice.cliente} · {fmtCLP(invoice.total)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Fecha</label>
                <input
                  className="input"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="field">
                <label className="label">Subtotal NC (CLP)</label>
                <input 
                  className="input" 
                  type="number" 
                  placeholder="0"
                  value={subtotalInput}
                  onChange={/* Ejecuta setSubtotalInput(e.target.value === "" ? "" : Number(e.target.value)) al invocarse este callback. */ (e) => setSubtotalInput(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="label">IVA NC (19%)</label>
                <input className="input" readOnly value={fmtCLP(ivaCalculado)} />
              </div>
              <div className="field">
                <label className="label">Total NC (CLP)</label>
                <input className="input" readOnly value={fmtCLP(totalCalculado)} />
              </div>
              <div className="field">
                <label className="label">Motivo *</label>
                <select 
                  className="select"
                  value={motivo}
                  onChange={/* Ejecuta setMotivo(e.target.value) al invocarse este callback. */ (e) => setMotivo(e.target.value)}
                >
                  <option value="">Seleccionar motivo…</option>
                  <option value="Devolución parcial de mercancía">Devolución parcial de mercancía</option>
                  <option value="Ajuste de precio por volumen">Ajuste de precio por volumen</option>
                  <option value="Error en facturación">Error en facturación</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Estado *</label>
                <select 
                  className="select"
                  value={estado}
                  onChange={/* Ejecuta setEstado(e.target.value) al invocarse este callback. */ (e) => setEstado(e.target.value)}
                >
                  <option value="EMITIDA">Emitida</option>
                  <option value="ANULADA">Anulada</option>
                  <option value="PENDIENTE">Pendiente</option>
                </select>
              </div>
              {errorGuardado && (
                <p style={{ color: "red", fontSize: 13, marginTop: 8 }}>
                  {errorGuardado}
                </p>
              )}
            </div>
            <div className="nc-actions">
              <button
                className="btn btn-primary"
                onClick={handleEmitirNC}
                disabled={guardando}
              >
                <Ico p={I.check} size={14} /> {guardando ? "Guardando..." : "Emitir NC"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={/* Ejecuta setShowNew(false) al invocarse este callback. */ () => setShowNew(false)}
                disabled={guardando}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
