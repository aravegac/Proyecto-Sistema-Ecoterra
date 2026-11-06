import { apiFetch } from "../api"
import React, { useEffect, useState } from "react"
import { getDocumentPdfUrl } from "../documentPdf"
import {
  Badge,
  formatMoney,
  redondearImporte,
  Currency,
  I,
  Ico,
  PageTitle,
  authHeaders,
  AuthUser,
  can,
} from "../shared"

type CreditNote = {
  id: number
  id_factura: number
  numero_nc: string
  factura_numero: string
  factura_total: string | number
  cliente_nombre: string
  fecha_emision: string
  subtotal: string | number
  iva: string | number
  total: string | number
  motivo: string
  estado: string
  ruta_pdf_nc: string
  moneda: Currency
  tipo_operacion: string
  creado_en: string | null
  id_usuario_anulacion_nc: number | null
  fecha_anulacion_nc: string | null
  motivo_anulacion_nc: string | null
}

type InvoiceOption = {
  id: string
  cliente: string
  total: number
  id_interno?: number
  moneda?: Currency
  estado?: string
}

type SourceInvoice = {
  id: number
  estado: string
  subtotal: string
  moneda_factura: Currency
  tipo_operacion: string
}

type NoteAction = {
  note: CreditNote
  action: "emitir" | "anular"
}

const motivos = [
  "Devolución parcial de mercancía",
  "Ajuste de precio por volumen",
  "Error en facturación",
]

const estadoLegible = (estado: string) =>
  ({ PENDIENTE: "Pendiente", EMITIDA: "Emitida", ANULADA: "Anulada" })[
    estado
  ] || estado

const fechaLegible = (fecha?: string | null) =>
  fecha ? new Date(fecha).toLocaleString("es-CL") : "Sin registrar"

export default function NotasCredito({
  facturas,
  authUser,
}: {
  facturas: InvoiceOption[]
  authUser: AuthUser | null
}) {
  const [notes, setNotes] = useState<CreditNote[]>([])

  const [cargando, setCargando] = useState(true)

  const [errorCarga, setErrorCarga] = useState("")

  const [listRetry, setListRetry] = useState(0)

  const [loadingNoteId, setLoadingNoteId] = useState<number | null>(null)

  const [listError, setListError] = useState("")

  const [showNew, setShowNew] = useState(false)

  const [editingNote, setEditingNote] = useState<CreditNote | null>(null)

  const [selectedFacturaId, setSelectedFacturaId] = useState("")

  const [sourceInvoice, setSourceInvoice] = useState<SourceInvoice | null>(null)

  const [sourceLoading, setSourceLoading] = useState(false)

  const [sourceError, setSourceError] = useState("")

  const [sourceRetry, setSourceRetry] = useState(0)

  const [fechaEmision, setFechaEmision] = useState("")

  const [numeroNC, setNumeroNC] = useState("")

  const [motivo, setMotivo] = useState("")

  const [subtotalInput, setSubtotalInput] = useState<number | "">("")

  const [guardando, setGuardando] = useState(false)

  const [errorGuardado, setErrorGuardado] = useState("")

  const [noteAction, setNoteAction] = useState<NoteAction | null>(null)

  const [actionReason, setActionReason] = useState("")

  const [actionError, setActionError] = useState("")

  const [actionLoading, setActionLoading] = useState(false)

  const [viewNote, setViewNote] = useState<CreditNote | null>(null)

  const [detailNote, setDetailNote] = useState<CreditNote | null>(null)

  const [detailLoading, setDetailLoading] = useState(false)

  const [detailError, setDetailError] = useState("")

  const [detailRetry, setDetailRetry] = useState(0)

  async function requestNote<T>(
    path: string,
    method = "GET",
    body?: object,
  ): Promise<T> {
    const response = await apiFetch(`/api/notas-credito/${path}`, {
      method,
      headers: authHeaders(authUser),
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        typeof data === "string"
          ? data
          : data
            ? Object.values(data).flat().join(" ")
            : "No se pudo completar la operación."

      throw new Error(message)
    }

    return data as T
  }

  const upsertNote = (note: CreditNote) => {
    setNotes((current) => [
      note,
      ...current.filter((item) => item.id !== note.id),
    ])

    if (viewNote?.id === note.id) setDetailNote(note)
  }

  const busy = guardando || actionLoading || loadingNoteId !== null

  const facturasDisponibles = facturas.filter(
    (invoice) =>
      !invoice.estado ||
      ["EMITIDA", "PAGADA"].includes(invoice.estado.toUpperCase()),
  )

  const facturaSeleccionada =
    facturas.find((invoice) => invoice.id === selectedFacturaId) ||
    (editingNote?.factura_numero === selectedFacturaId
      ? {
          id: editingNote.factura_numero,
          id_interno: editingNote.id_factura,
          cliente: editingNote.cliente_nombre,

          total: Number(editingNote.factura_total),
          moneda: editingNote.moneda,
        }
      : undefined)

  useEffect(() => {
    const controller = new AbortController()

    let active = true

    setCargando(true)

    setErrorCarga("")

    if (!authUser) {
      setNotes([])
      setCargando(false)
      return
    }

    const load = async () => {
      try {
        const response = await apiFetch("/api/notas-credito/", {
          headers: authHeaders(authUser),
          signal: controller.signal,
        })

        const data = await response.json()

        if (!response.ok || !Array.isArray(data))
          throw new Error("No se pudieron cargar las notas de crédito.")

        if (active) setNotes(data)
      } catch (error) {
        if (active)
          setErrorCarga(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el listado.",
          )
      } finally {
        if (active) setCargando(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [authUser, listRetry])

  useEffect(() => {
    setSourceInvoice(null)

    setSourceError("")

    setSubtotalInput("")

    if (!showNew || !facturaSeleccionada) {
      setSourceLoading(false)
      return
    }

    const controller = new AbortController()

    let active = true

    setSourceLoading(true)

    const load = async () => {
      try {
        if (!facturaSeleccionada.id_interno)
          throw new Error("No se pudo identificar la factura de origen.")

        const response = await apiFetch(
          `/api/facturas/${facturaSeleccionada.id_interno}/`,
          {
            headers: authHeaders(authUser),
            signal: controller.signal,
          },
        )

        const data = await response.json()

        if (!response.ok)
          throw new Error("No se pudo cargar la factura de origen.")

        if (!["EMITIDA", "PAGADA"].includes(data.estado))
          throw new Error("Selecciona una factura emitida o pagada.")

        if (active) {
          setSourceInvoice(data)

          setSubtotalInput(
            editingNote && editingNote.id_factura === data.id
              ? Number(editingNote.subtotal)
              : Number(data.subtotal),
          )
        }
      } catch (error) {
        if (active)
          setSourceError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar la factura.",
          )
      } finally {
        if (active) setSourceLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [
    showNew,
    facturaSeleccionada?.id_interno,
    selectedFacturaId,
    authUser,
    sourceRetry,
    editingNote?.id,
  ])

  useEffect(() => {
    setDetailNote(null)

    setDetailError("")

    if (!viewNote) return

    let active = true

    setDetailLoading(true)

    const load = async () => {
      try {
        const data = await requestNote<CreditNote>(`${viewNote.id}/`)

        if (active) setDetailNote(data)
      } catch (error) {
        if (active)
          setDetailError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el detalle.",
          )
      } finally {
        if (active) setDetailLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [viewNote?.id, authUser, detailRetry])

  const subtotalNum = Number(subtotalInput) || 0

  const moneda = sourceInvoice?.moneda_factura || "CLP"

  const ivaRate = sourceInvoice?.tipo_operacion === "Internacional" ? 0 : 19

  const ivaCalculado = redondearImporte((subtotalNum * ivaRate) / 100)

  const totalCalculado = subtotalNum + ivaCalculado

  const openNew = () => {
    setEditingNote(null)

    setNumeroNC(`NC-${Date.now()}`)

    setFechaEmision(new Date().toLocaleDateString("en-CA"))

    setSelectedFacturaId("")

    setMotivo("")

    setSubtotalInput("")

    setErrorGuardado("")

    setShowNew(true)
  }

  const closeForm = () => {
    if (guardando) return

    setShowNew(false)

    setEditingNote(null)
  }

  const openEdit = async (note: CreditNote) => {
    setLoadingNoteId(note.id)

    setListError("")

    try {
      const data = await requestNote<CreditNote>(`${note.id}/`)

      upsertNote(data)

      if (data.estado !== "PENDIENTE")
        throw new Error("Solo se pueden editar notas de crédito pendientes.")

      setEditingNote(data)

      setNumeroNC(data.numero_nc)

      setFechaEmision(data.fecha_emision)

      setSelectedFacturaId(data.factura_numero)

      setMotivo(data.motivo)

      setErrorGuardado("")

      setShowNew(true)
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la edición.",
      )
    } finally {
      setLoadingNoteId(null)
    }
  }

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault()

    if (guardando) return

    if (
      !sourceInvoice ||
      !motivo.trim() ||
      !fechaEmision ||
      subtotalInput === "" ||
      !Number.isFinite(subtotalNum) ||
      subtotalNum <= 0
    ) {
      setErrorGuardado(
        "Completa todos los campos obligatorios con valores válidos.",
      )

      return
    }

    setGuardando(true)

    setErrorGuardado("")

    try {
      const saved = await requestNote<CreditNote>(
        editingNote ? `${editingNote.id}/` : "",
        editingNote ? "PUT" : "POST",
        {
          id_factura: sourceInvoice.id,
          numero_nc: numeroNC,
          fecha_emision: fechaEmision,
          motivo,

          subtotal_bruto: subtotalNum,
        },
      )

      upsertNote(saved)

      setShowNew(false)

      setEditingNote(null)
    } catch (error) {
      setErrorGuardado(
        error instanceof Error ? error.message : "No se pudo guardar la nota.",
      )
    } finally {
      setGuardando(false)
    }
  }

  const confirmAction = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!noteAction || actionLoading) return

    setActionLoading(true)

    setActionError("")

    try {
      const endpoint = noteAction.action === "emitir" ? "generar-pdf" : "anular"

      const saved = await requestNote<CreditNote>(
        `${noteAction.note.id}/${endpoint}/`,
        "POST",

        noteAction.action === "anular"
          ? { motivo_anulacion_nc: actionReason.trim() }
          : {},
      )

      upsertNote(saved)

      setNoteAction(null)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "No se pudo completar la acción.",
      )
    } finally {
      setActionLoading(false)
    }
  }

  const downloadPdf = async (note: CreditNote) => {
    if (note.estado === "PENDIENTE") return

    const tab = window.open("about:blank", "_blank")

    if (!tab) {
      alert("Permite las ventanas emergentes para abrir el PDF.")
      return
    }

    tab.opener = null

    tab.document.body.textContent = "Cargando PDF…"

    try {
      tab.location.href = await getDocumentPdfUrl(
        `/api/notas-credito/${note.id}`,
        authUser,
      )
    } catch (error) {
      tab.close()

      alert(error instanceof Error ? error.message : "No se pudo abrir el PDF.")
    }
  }

  const canViewPdf = (note: CreditNote) =>
    note.estado !== "PENDIENTE" &&
    (Boolean(note.ruta_pdf_nc) ||
      (note.estado === "EMITIDA" && can(authUser, "notas_credito", "Editar")))

  return (
    <div>
      <PageTitle
        title="Notas de Crédito"
        sub="Documentos asociados a facturas emitidas"
      >
        <button
          className="btn btn-primary"
          onClick={openNew}
          disabled={
            cargando || busy || !can(authUser, "notas_credito", "Crear")
          }
        >
          <Ico p={I.plus} size={14} /> Nueva NC
        </button>
      </PageTitle>
      {listError && <p role="alert">{listError}</p>}
      {loadingNoteId !== null && (
        <p role="status">Cargando nota de crédito para editar…</p>
      )}
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
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={10} role="status" style={{ textAlign: "center", padding: "24px" }}>
                  Cargando Notas de Crédito...
                </td>
              </tr>
            ) : errorCarga ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "24px" }}>
                  <div role="alert">
                    <p>{errorCarga}</p>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setListRetry((value) => value + 1)}
                    >
                      Reintentar
                    </button>
                  </div>
                </td>
              </tr>
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "24px" }}>No hay notas de crédito registradas.</td>
              </tr>
            ) : (
              notes.map((note) => (
                <tr key={note.id}>
                  <td className="nc-id">{note.numero_nc}</td>
                  <td>{note.factura_numero}</td>
                  <td>{note.cliente_nombre}</td>
                  <td>{note.fecha_emision}</td>
                  <td>{formatMoney(Number(note.subtotal), note.moneda)}</td>
                  <td>{formatMoney(Number(note.iva), note.moneda)}</td>
                  <td className="nc-monto">
                    {formatMoney(Number(note.total), note.moneda)}
                  </td>
                  <td className="nc-reason-cell">{note.motivo}</td>
                  <td>
                    <Badge
                      t={
                        note.estado === "EMITIDA"
                          ? "ok"
                          : note.estado === "ANULADA"
                            ? "danger"
                            : "warn"
                      }
                    >
                      {estadoLegible(note.estado)}
                    </Badge>
                  </td>
                  <td>
                    <div className="nc-row-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-label={`Ver ${note.numero_nc}`}
                        disabled={busy}
                        title="Detalles"
                        onClick={() => setViewNote(note)}
                      >
                        <Ico p={I.pdf} size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-label={`PDF ${note.numero_nc}`}
                        title="Ver PDF"
                        disabled={busy || !canViewPdf(note)}
                        onClick={() => void downloadPdf(note)}
                      >
                        <Ico p={I.download} size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm productos-edit-btn"
                        aria-label={`Editar ${note.numero_nc}`}
                        title="Editar"
                        disabled={
                          busy ||
                          note.estado !== "PENDIENTE" ||
                          !can(authUser, "notas_credito", "Editar")
                        }
                        onClick={() => void openEdit(note)}
                      >
                        <Ico p={I.edit} size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-label={`Emitir ${note.numero_nc}`}
                        title="Emitir PDF"
                        disabled={
                          busy ||
                          note.estado !== "PENDIENTE" ||
                          !can(authUser, "notas_credito", "Editar")
                        }
                        onClick={() => {
                          setNoteAction({ note, action: "emitir" })
                          setActionError("")
                          setActionReason("")
                        }}
                      >
                        <Ico p={I.send} size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm productos-delete-btn"
                        aria-label={`Anular ${note.numero_nc}`}
                        title="Anular"
                        disabled={
                          busy ||
                          !["PENDIENTE", "EMITIDA"].includes(note.estado) ||
                          !can(authUser, "notas_credito", "Eliminar")
                        }
                        onClick={() => {
                          setNoteAction({ note, action: "anular" })
                          setActionError("")
                          setActionReason("")
                        }}
                      >
                        <Ico p={I.trash} size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="modal-backdrop" onClick={closeForm}>
          <form
            className="modal nc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nc-form-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveNote}
          >
            <div className="nc-modal-header">
              <div>
                <h2 className="nc-modal-title" id="nc-form-title">
                  {editingNote
                    ? "Editar nota de crédito pendiente"
                    : "Nueva Nota de Crédito"}
                </h2>
                <Badge t="warn">Pendiente</Badge>
              </div>
              <button
                type="button"
                className="nc-modal-close"
                aria-label="Cerrar formulario de nota de crédito"
                disabled={guardando}
                onClick={closeForm}
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>
            <div className="nc-form-stack">
              <div className="field">
                <label className="label" htmlFor="nc-source-invoice">
                  Factura de Origen *
                </label>
                <select
                  className="select"
                  id="nc-source-invoice"
                  required
                  value={selectedFacturaId}
                  onChange={(event) => {
                    setSelectedFacturaId(event.target.value)
                    setErrorGuardado("")
                  }}
                >
                  <option value="">Seleccionar factura…</option>
                  {editingNote &&
                    !facturasDisponibles.some(
                      (invoice) => invoice.id === editingNote.factura_numero,
                    ) && (
                      <option value={editingNote.factura_numero}>
                        {editingNote.factura_numero} · Factura de origen
                      </option>
                    )}
                  {facturasDisponibles.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.id} · {invoice.cliente} ·{" "}
                      {formatMoney(invoice.total, invoice.moneda)}
                    </option>
                  ))}
                </select>
              </div>
              {sourceLoading && (
                <p role="status">Cargando datos de la factura…</p>
              )}
              {sourceError && (
                <div role="alert">
                  <p>{sourceError}</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSourceRetry((value) => value + 1)}
                  >
                    Reintentar
                  </button>
                </div>
              )}
              <div className="nc-inherited-grid">
                <div className="field">
                  <label className="label" htmlFor="nc-currency">
                    Moneda
                  </label>
                  <input
                    id="nc-currency"
                    className="input"
                    readOnly
                    value={sourceInvoice?.moneda_factura || ""}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="nc-operation">
                    Tipo de operación
                  </label>
                  <input
                    id="nc-operation"
                    className="input"
                    readOnly
                    value={sourceInvoice?.tipo_operacion || ""}
                  />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-date">
                  Fecha
                </label>
                <input
                  id="nc-date"
                  className="input"
                  type="date"
                  required
                  value={fechaEmision}
                  onChange={(event) => setFechaEmision(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-subtotal">
                  Subtotal NC ({moneda})
                </label>
                <input
                  id="nc-subtotal"
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={!sourceInvoice || sourceLoading}
                  value={subtotalInput}
                  onChange={(event) =>
                    setSubtotalInput(
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-tax">
                  IVA NC ({ivaRate}%)
                </label>
                <input
                  id="nc-tax"
                  className="input"
                  readOnly
                  value={formatMoney(ivaCalculado, moneda)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-total">
                  Total NC ({moneda})
                </label>
                <input
                  id="nc-total"
                  className="input"
                  readOnly
                  value={formatMoney(totalCalculado, moneda)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="nc-reason">
                  Motivo *
                </label>
                <select
                  id="nc-reason"
                  className="select"
                  required
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                >
                  <option value="">Seleccionar motivo…</option>
                  {motivo && !motivos.includes(motivo) && (
                    <option value={motivo}>{motivo}</option>
                  )}
                  {motivos.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>
              {errorGuardado && <p role="alert">{errorGuardado}</p>}
            </div>
            <div className="nc-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={guardando || sourceLoading || !sourceInvoice}
              >
                {guardando
                  ? "Guardando…"
                  : editingNote
                    ? "Guardar cambios"
                    : "Guardar pendiente"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={guardando}
                onClick={closeForm}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {noteAction && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!actionLoading) setNoteAction(null)
          }}
        >
          <form
            className="modal nc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nc-action-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={confirmAction}
          >
            <h2 id="nc-action-title" className="nc-modal-title">
              {noteAction.action === "emitir"
                ? "¿Emitir esta nota de crédito?"
                : "¿Anular esta nota de crédito?"}
            </h2>
            <p className="nc-action-text">{noteAction.note.numero_nc}</p>
            <p className="nc-action-text">
              {noteAction.action === "emitir"
                ? "Se generará el PDF y la nota quedará emitida. Sus datos comerciales quedarán bloqueados."
                : "La nota permanecerá en el historial con su motivo, fecha y usuario responsable."}
            </p>
            {noteAction.action === "anular" && (
              <div className="field">
                <label className="label" htmlFor="nc-cancel-reason">
                  Motivo de anulación *
                </label>
                <textarea
                  id="nc-cancel-reason"
                  className="textarea"
                  required
                  value={actionReason}
                  disabled={actionLoading}
                  onChange={(event) => setActionReason(event.target.value)}
                />
              </div>
            )}
            {actionError && <p role="alert">{actionError}</p>}
            <div className="nc-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={actionLoading}
                onClick={() => setNoteAction(null)}
              >
                Cancelar
              </button>
              <button
                className={`btn ${
                  noteAction.action === "anular" ? "btn-danger" : "btn-primary"
                }`}
                type="submit"
                disabled={
                  actionLoading ||
                  (noteAction.action === "anular" && !actionReason.trim())
                }
              >
                {actionLoading
                  ? "Procesando…"
                  : noteAction.action === "emitir"
                    ? "Confirmar emisión"
                    : "Confirmar anulación"}
              </button>
            </div>
          </form>
        </div>
      )}

      {viewNote && (
        <div className="modal-backdrop" onClick={() => setViewNote(null)}>
          <div
            className="modal nc-modal nc-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nc-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nc-modal-header">
              <h2 id="nc-detail-title" className="nc-modal-title">
                Nota de crédito {viewNote.numero_nc}
              </h2>
              <button
                className="nc-modal-close"
                aria-label="Cerrar detalle de nota de crédito"
                onClick={() => setViewNote(null)}
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>
            {detailLoading ? (
              <p role="status">Cargando detalle…</p>
            ) : detailError ? (
              <div role="alert">
                <p>{detailError}</p>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDetailRetry((value) => value + 1)}
                >
                  Reintentar
                </button>
              </div>
            ) : (
              detailNote && (
                <>
                  <dl className="nc-detail-grid">
                    {[
                      ["Factura de origen", detailNote.factura_numero],
                      ["Cliente", detailNote.cliente_nombre],

                      ["Fecha del documento", detailNote.fecha_emision],
                      ["Estado", estadoLegible(detailNote.estado)],

                      ["Moneda", detailNote.moneda],
                      ["Tipo de operación", detailNote.tipo_operacion],

                      [
                        "Subtotal",
                        formatMoney(
                          Number(detailNote.subtotal),
                          detailNote.moneda,
                        ),
                      ],
                      [
                        "IVA",
                        formatMoney(Number(detailNote.iva), detailNote.moneda),
                      ],

                      [
                        "Total",
                        formatMoney(
                          Number(detailNote.total),
                          detailNote.moneda,
                        ),
                      ],
                      ["Registrada", fechaLegible(detailNote.creado_en)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="label">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <section className="nc-detail-section">
                    <h3>Motivo de la nota</h3>
                    <p>{detailNote.motivo}</p>
                  </section>
                  {detailNote.estado === "ANULADA" && (
                    <section className="nc-detail-section">
                      <h3>Anulación</h3>
                      <p>
                        Motivo:{" "}
                        {detailNote.motivo_anulacion_nc || "Sin registrar"}
                      </p>
                      <p>
                        Fecha: {fechaLegible(detailNote.fecha_anulacion_nc)}
                      </p>
                      <p>
                        Usuario responsable:{" "}
                        {detailNote.id_usuario_anulacion_nc ?? "Sin registrar"}
                      </p>
                    </section>
                  )}
                  <div className="nc-actions">
                    <button
                      className="btn btn-ghost"
                      disabled={!canViewPdf(detailNote)}
                      onClick={() => void downloadPdf(detailNote)}
                    >
                      Consultar PDF
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setViewNote(null)}
                    >
                      Cerrar
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
