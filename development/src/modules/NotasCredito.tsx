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
  const downloadCreditNotePdf = (note: CreditNote) => {
    const printWindow = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=900,height=700",
    )
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Nota de Crédito ${note.numero_nc}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            .card { border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #dc2626; padding-bottom: 14px; margin-bottom: 18px; }
            .brand { color: #dc2626; font-size: 20px; font-weight: 700; }
            .meta { color: #64748b; font-size: 12px; margin-top: 6px; }
            .totals { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; font-weight: 700; }
            .muted { color: #64748b; }
            .motivo { background: #f8fafc; padding: 12px; border-radius: 8px; margin-top: 16px; font-size: 13px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div>
                <div class="brand">Ecoterra</div>
                <div class="meta">Nota de Crédito Electrónica</div>
              </div>
              <strong>${note.numero_nc}</strong>
            </div>
            <p><strong>${note.cliente_nombre}</strong></p>
            <p class="muted">Factura origen ${note.factura_numero} · Emisión ${note.fecha_emision}</p>
            <div class="motivo"><strong>Motivo:</strong> ${note.motivo}</div>
            <div class="totals">
              <span>SUBTOTAL</span>
              <span>${fmtCLP(-note.subtotal)}</span>
            </div>
            <div class="totals" style="border-top: none; padding-top: 0; margin-top: 4px;">
              <span>IVA (19%)</span>
              <span>${fmtCLP(-note.iva)}</span>
            </div>
            <div class="totals" style="border-top: 2px solid #dc2626; padding-top: 10px; margin-top: 10px;">
              <span>TOTAL</span>
              <span>${fmtCLP(-note.total)}</span>
            </div>
            <div class="totals" style="border-top: none; padding-top: 4px; margin-top: 0; font-weight: 400; color: #64748b; font-size: 12px;">
              <span>Estado</span>
              <span>${note.estado}</span>
            </div>
          </div>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
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
                  <td>{fmtCLP(-note.subtotal)}</td>
                  <td>{fmtCLP(-note.iva)}</td>
                  <td className="nc-monto">{fmtCLP(-note.total)}</td>
                  <td>{note.motivo}</td>
                  <td>
                    <Badge t={note.estado === "ANULADA" ? "danger" : "ok"}>
                      {note.estado}
                    </Badge>
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
