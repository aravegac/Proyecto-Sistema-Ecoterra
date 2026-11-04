// src/modules/NotasCredito.tsx
import React, { useEffect, useState } from "react"
import { Badge, formatMoney, redondearImporte, Currency, I, Ico, PageTitle, authHeaders, AuthUser } from "../shared"

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
  moneda: Currency
  tipo_operacion: string
}

type SourceInvoice = {
  id: number
  estado: string
  subtotal: string
  moneda_factura: Currency
  tipo_operacion: string
}

// Carga las notas de crédito y permite emitirlas sobre una factura y abrir su vista de impresión.
export default function NotasCredito({
  facturas,
  authUser,
}: {
  facturas: { id: string; cliente: string; total: number; id_interno?: number; moneda?: Currency; estado?: string }[]
  authUser: AuthUser | null
}) {
  const [showNew, setShowNew] = useState(false)

  // Estados para la lista de notas
  const [notes, setNotes] = useState<CreditNote[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState("")

  // Estados para el formulario de nueva NC
  const [selectedFacturaId, setSelectedFacturaId] = useState("")
  const [sourceInvoice, setSourceInvoice] = useState<SourceInvoice | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceError, setSourceError] = useState("")
  const [sourceRetry, setSourceRetry] = useState(0)
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toLocaleDateString("en-CA"))
  const [numeroNC, setNumeroNC] = useState("")
  const [motivo, setMotivo] = useState("")
  const [estado, setEstado] = useState("EMITIDA")
  const [subtotalInput, setSubtotalInput] = useState<number | "">("")
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState("")
  const facturaSeleccionada = facturas.find((invoice) => invoice.id === selectedFacturaId)
  const facturasDisponibles = facturas.filter((invoice) => !invoice.estado || ["EMITIDA", "PAGADA"].includes(invoice.estado.toUpperCase()))

  useEffect(() => {
    setSourceInvoice(null)
    setSourceError("")
    setSubtotalInput("")
    if (!showNew || !facturaSeleccionada) { setSourceLoading(false); return }
    const controller = new AbortController()
    let active = true
    setSourceLoading(true)
    const load = async () => {
      try {
        if (!facturaSeleccionada.id_interno) throw new Error("No se pudo identificar la factura de origen.")
        const response = await fetch(`/api/facturas/${facturaSeleccionada.id_interno}/`, {
          headers: authHeaders(authUser), signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error("No se pudo cargar la factura de origen.")
        if (!["EMITIDA", "PAGADA"].includes(data.estado)) throw new Error("Selecciona una factura emitida o pagada.")
        if (active) {
          setSourceInvoice(data)
          setSubtotalInput(Number(data.subtotal))
        }
      } catch (error) {
        if (active) setSourceError(error instanceof Error ? error.message : "No se pudo cargar la factura.")
      } finally {
        if (active) setSourceLoading(false)
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [showNew, facturaSeleccionada?.id_interno, selectedFacturaId, authUser, sourceRetry])

    

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
  const moneda = sourceInvoice?.moneda_factura || "CLP"
  const ivaRate = sourceInvoice?.tipo_operacion === "Internacional" ? 0 : 19
  const ivaCalculado = redondearImporte(subtotalNum * ivaRate / 100)
  const totalCalculado = subtotalNum + ivaCalculado

  // Función para guardar la nueva NC
  // Valida sesión y formulario, emite la nota de crédito en la API y actualiza la lista local.
  const handleEmitirNC = async () => {
    if (guardando) return
    if (!authUser) {
      setErrorGuardado("No hay sesión activa.")
      return
    }
    if (!sourceInvoice || !motivo || !fechaEmision || subtotalInput === "" || !Number.isFinite(subtotalNum) || subtotalNum <= 0) {
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
          id_factura: sourceInvoice.id,
          numero_nc: numeroNC,
          fecha_emision: fechaEmision,
          motivo: motivo,
          estado: estado,
          subtotal_bruto: subtotalNum,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
        throw new Error(
          errData ? Object.values(errData).flat().join(" ") : "Error al crear la nota de crédito."
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
        <button className="btn btn-primary" onClick={() => {
          setNumeroNC(`NC-${Date.now()}`)
          setFechaEmision(new Date().toLocaleDateString("en-CA"))
          setSelectedFacturaId("")
          setMotivo("")
          setSubtotalInput("")
          setEstado("EMITIDA")
          setErrorGuardado("")
          setShowNew(true)
        }}>
          <Ico p={I.plus} size={14} /> Nueva NC
        </button>
      </PageTitle>
      <div className="panel nc-table-panel">
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
                  <td>{formatMoney(Number(note.subtotal), note.moneda)}</td>
                  <td>{formatMoney(Number(note.iva), note.moneda)}</td>
                  <td className="nc-monto">{formatMoney(Number(note.total), note.moneda)}</td>
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
        <div className="modal-backdrop" onClick={() => { if (!guardando) setShowNew(false) }}>
          <div
            className="modal nc-modal" role="dialog" aria-modal="true" aria-labelledby="nc-form-title"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="nc-modal-header">
              <h2 className="nc-modal-title" id="nc-form-title">
                Nueva Nota de Crédito
              </h2>
              <button aria-label="Cerrar formulario de nota de crédito" disabled={guardando} onClick={() => { if (!guardando) setShowNew(false) }} className="nc-modal-close">
                <Ico p={I.x} size={18} />
              </button>
            </div>
            <div className="nc-form-stack">
              <div className="field">
                <label className="label" htmlFor="nc-source-invoice">Factura de Origen *</label>
                <select 
                  className="select"
                  id="nc-source-invoice"
                  value={selectedFacturaId}
                  onChange={(event) => { setSelectedFacturaId(event.target.value); setErrorGuardado("") }}
                >
                  <option value="">Seleccionar factura…</option>
                  {facturasDisponibles.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.id} · {invoice.cliente} · {formatMoney(invoice.total, invoice.moneda)}
                    </option>
                  ))}
                </select>
                {facturasDisponibles.length === 0 && <p>No hay facturas emitidas o pagadas disponibles.</p>}
              </div>
              {sourceLoading && <p role="status">Cargando datos de la factura…</p>}
              {sourceError && <div role="alert">
                <p>{sourceError}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSourceRetry((value) => value + 1)}>Reintentar</button>
              </div>}
              <div className="nc-inherited-grid">
                <div className="field">
                  <label className="label" htmlFor="nc-currency">Moneda</label>
                  <input id="nc-currency" className="input" readOnly value={sourceInvoice?.moneda_factura || ""} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="nc-operation">Tipo de operación</label>
                  <input id="nc-operation" className="input" readOnly value={sourceInvoice?.tipo_operacion || ""} />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-date">Fecha</label>
                <input
                  className="input"
                  type="date"
                  id="nc-date"
                  value={fechaEmision}
                  onChange={(event) => setFechaEmision(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-subtotal">Subtotal NC ({moneda})</label>
                <input 
                  className="input" 
                  type="number" 
                  placeholder="0"
                  id="nc-subtotal"
                  min="0.01" step="0.01" disabled={!sourceInvoice || sourceLoading}
                  value={subtotalInput}
                  onChange={/* Ejecuta setSubtotalInput(e.target.value === "" ? "" : Number(e.target.value)) al invocarse este callback. */ (e) => setSubtotalInput(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-tax">IVA NC ({ivaRate}%)</label>
                <input className="input" id="nc-tax" readOnly value={formatMoney(ivaCalculado, moneda)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-total">Total NC ({moneda})</label>
                <input className="input" id="nc-total" readOnly value={formatMoney(totalCalculado, moneda)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-reason">Motivo *</label>
                <select 
                  className="select"
                  id="nc-reason"
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
                disabled={guardando || sourceLoading || !sourceInvoice}
              >
                <Ico p={I.check} size={14} /> {guardando ? "Guardando..." : "Emitir NC"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { if (!guardando) setShowNew(false) }}
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
