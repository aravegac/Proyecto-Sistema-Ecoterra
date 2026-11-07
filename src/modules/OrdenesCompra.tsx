import { apiFetch } from "../api"
import React, { useEffect, useRef, useState } from "react"
import { AuthUser, authHeaders, Badge, can, fmtCLP, I, Ico, PageTitle } from "../shared"

export type PurchaseOrder = {
  idOc: number
  id: string
  clienteId: number
  cotizacionId: number | null
  cot: string
  cliente: string
  fecha: string
  total: number
  estado: string
  factura: string | null
  tipoOperacion: "Nacional" | "Internacional"
  documento: string
}

type Invoice = { id: string; oc: string }

export const mapOrdenFromApi = (item: any): PurchaseOrder => ({
  idOc: Number(item.id_oc),
  id: item.numero_oc,
  clienteId: Number(item.id_cliente),
  cotizacionId: item.id_cotizacion == null ? null : Number(item.id_cotizacion),
  cot: item.cotizacion_numero || "",
  cliente: item.cliente_nombre || "",
  fecha: item.fecha_oc,
  total: Number(item.cotizacion_detalle?.total_cotizacion ?? 0),
  estado: "Pendiente",
  factura: item.factura_numero || null,
  tipoOperacion: item.tipo_operacion_oc || "Nacional",
  documento: item.ruta_documento_oc || "",
})

const emptyForm = {
  numero: "", clienteId: "", fecha: "",
  tipoOperacion: "Nacional" as "Nacional" | "Internacional",
}

export default function OrdenesCompra({
  ordenes, facturas, clientes, authUser, onOrdenesChange,
}: {
  ordenes: PurchaseOrder[]
  facturas: Invoice[]
  clientes: { id: number; razon: string }[]
  authUser: AuthUser | null
  onOrdenesChange: () => Promise<void>
}) {
  const [orders, setOrders] = useState(ordenes)
  const [clientFilter, setClientFilter] = useState("")
  const [invoiceFilter, setInvoiceFilter] = useState("")
  const [pageError, setPageError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [previewOrder, setPreviewOrder] = useState<PurchaseOrder | null>(null)
  const [documentUrl, setDocumentUrl] = useState("")
  const [documentError, setDocumentError] = useState("")
  const [documentLoading, setDocumentLoading] = useState(false)
  const [detectNote, setDetectNote] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const pdfField = useRef<HTMLInputElement>(null)
  const documentRequest = useRef(0)
  const detectRequest = useRef(0)

  useEffect(() => {
    setIsLoading(true)
    setOrders(ordenes)
    setIsLoading(false)
  }, [ordenes])
  useEffect(() => {
    if (!file) { setFileUrl(""); return }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const invoiceNumber = (order: PurchaseOrder) =>
    facturas.find((invoice) => invoice.oc === order.id)?.id || order.factura

  const filtered = orders.filter((order) =>
    (!clientFilter || order.clienteId === Number(clientFilter)) &&
    (!invoiceFilter || Boolean(invoiceNumber(order)) === (invoiceFilter === "con")),
  )

  const loadDocument = async (order: PurchaseOrder) => {
    if (!can(authUser, "ordenes_compra", "Descargar PDF")) {
      setDocumentUrl("")
      setDocumentError("No tienes permisos para consultar el documento PDF.")
      return
    }
    const requestId = ++documentRequest.current
    setDocumentUrl("")
    setDocumentError("")
    setDocumentLoading(true)
    try {
      const response = await apiFetch(`/api/ordenes-compra/${order.idOc}/documento/`, {
        headers: authHeaders(authUser), cache: "no-store",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || "No se pudo abrir el documento.")
      const url = new URL(data.url, window.location.origin)
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enlace de documento inválido.")
      if (requestId === documentRequest.current) setDocumentUrl(url.href)
    } catch (error) {
      if (requestId === documentRequest.current) setDocumentError(error instanceof Error ? error.message : "No se pudo abrir el documento.")
    } finally {
      if (requestId === documentRequest.current) setDocumentLoading(false)
    }
  }

  // Lee el PDF en el backend y completa los campos que sigan vacíos.
  const detectFields = async (selected: File) => {
    if (!can(authUser, "ordenes_compra", "Crear / Subir PDF")) return
    const requestId = ++detectRequest.current
    setDetectNote("Leyendo el PDF…")
    const body = new FormData()
    body.set("archivo", selected)
    const headers = new Headers(authHeaders(authUser))
    headers.delete("Content-Type")
    try {
      const response = await apiFetch("/api/ordenes-compra/detectar/", { method: "POST", headers, body })
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (requestId !== detectRequest.current) return
      setForm((current) => ({
        ...current,
        numero: current.numero || data.numero_oc || "",
        clienteId: current.clienteId || (data.id_cliente ? String(data.id_cliente) : ""),
        tipoOperacion: data.tipo_operacion_oc || current.tipoOperacion,
      }))
      const missing = [!data.numero_oc && "N° de orden", !data.id_cliente && "cliente", !data.tipo_operacion_oc && "tipo de operación"].filter(Boolean)
      setDetectNote(missing.length ? `Revisa los datos. No se detectó: ${missing.join(", ")}.` : "Datos detectados del PDF. Revísalos antes de guardar.")
    } catch {
      if (requestId === detectRequest.current) setDetectNote("No se pudieron leer los datos del PDF. Complétalos a mano.")
    }
  }

  const selectFile = (selected: File, detect = false) => {
    if (selected.size > 25 * 1024 * 1024 || !selected.name.toLowerCase().endsWith(".pdf")) {
      setFormError("Selecciona un PDF de hasta 25 MB.")
      setFile(null)
      return
    }
    setFormError("")
    setFile(selected)
    if (detect) void detectFields(selected)
  }

  const openNewFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!can(authUser, "ordenes_compra", "Crear / Subir PDF")) {
    event.target.value = ""
    return
    }
    const selected = event.target.files?.[0]
    if (!selected) return
    setEditingOrder(null)
    setForm({ ...emptyForm, fecha: new Date().toISOString().slice(0, 10) })
    setFile(null)
    setDocumentUrl("")
    setDocumentError("")
    documentRequest.current++
    setDocumentLoading(false)
    setDetectNote("")
    setShowForm(true)
    selectFile(selected, true)
    event.target.value = ""
  }

  const openEdit = (order: PurchaseOrder) => {
    if (!can(authUser, "ordenes_compra", "Editar")) return
    setEditingOrder(order)
    setForm({ numero: order.id, clienteId: String(order.clienteId), fecha: order.fecha, tipoOperacion: order.tipoOperacion })
    setFile(null)
    setFormError("")
    setDetectNote("")
    detectRequest.current++
    setShowForm(true)
    void loadDocument(order)
  }

  const closeForm = () => {
    if (saving) return
    setShowForm(false)
    setFile(null)
    documentRequest.current++
    detectRequest.current++
  }

  const saveOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (
      editingOrder
        ? !can(authUser, "ordenes_compra", "Editar")
        : !can(authUser, "ordenes_compra", "Crear / Subir PDF")
    ) {
      return
    }
    if (!editingOrder && !file) { setFormError("Adjunta el documento PDF."); return }
    setSaving(true)
    setFormError("")
    const body = new FormData()
    body.set("numero_oc", form.numero.trim())
    body.set("id_cliente", form.clienteId)
    body.set("fecha_oc", form.fecha)
    body.set("tipo_operacion_oc", form.tipoOperacion)
    if (file) body.set("archivo", file)
    const headers = new Headers(authHeaders(authUser))
    headers.delete("Content-Type")
    try {
      const response = await apiFetch(editingOrder ? `/api/ordenes-compra/${editingOrder.idOc}/` : "/api/ordenes-compra/", {
        method: editingOrder ? "PATCH" : "POST", headers, body,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "No se pudo guardar la orden.")
      const saved = mapOrdenFromApi(data)
      setOrders((current) => [saved, ...current.filter((order) => order.idOc !== saved.idOc)])
      setShowForm(false)
      setFile(null)
      try {
        await onOrdenesChange()
        setPageError("")
      } catch {
        setPageError("La orden se guardó. No se pudo actualizar el listado completo. Recarga para consultarlo.")
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar la orden.")
    } finally {
      setSaving(false)
    }
  }

  const unlinkQuote = async (order: PurchaseOrder) => {
    if (!can(authUser, "ordenes_compra", "Eliminar")) return
    if (!window.confirm(`¿Desasociar la cotización ${order.cot} de ${order.id}?`)) return
    setPageError("")
    try {
      const response = await apiFetch(`/api/ordenes-compra/${order.idOc}/desasociar-cotizacion/`, {
        method: "DELETE", headers: authHeaders(authUser),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || "No se pudo desasociar la cotización.")
      const saved = mapOrdenFromApi(data)
      setOrders((current) => current.map((item) => item.idOc === saved.idOc ? saved : item))
      await onOrdenesChange()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "No se pudo actualizar el listado.")
    }
  }

  const renderDocument = (order: PurchaseOrder | null) => <div className="oc-preview-box">
    <div className="oc-preview-header">Documento de orden de compra</div>
    {fileUrl && showForm ? <iframe title="PDF seleccionado" src={fileUrl} className="oc-preview-frame" />
      : documentLoading ? <p role="status">Cargando documento…</p>
      : documentUrl ? <>
        <iframe title="Documento de orden de compra" src={documentUrl} className="oc-preview-frame" />
        <a className="btn btn-ghost btn-sm" href={documentUrl} target="_blank" rel="noopener noreferrer">Abrir documento en otra pestaña</a>
      </> : <div className="oc-preview-empty">
        <p role={documentError ? "alert" : undefined}>{documentError || "Selecciona un archivo PDF."}</p>
        {order && <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadDocument(order)}>Reintentar</button>}
      </div>}
    {showForm && file && <div className="oc-preview-note">{file.name}</div>}
  </div>

  return <div>
    <PageTitle title="Órdenes de Compra" sub="Documentos recibidos de clientes y seguimiento de su facturación">
      <button className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={!can(authUser, "ordenes_compra", "Crear / Subir PDF")}>
        <Ico p={I.upload} size={14} /> Subir OC en PDF
      </button>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="oc-hidden-input" onChange={openNewFile} />
    </PageTitle>
    {pageError && <p role="alert">{pageError}</p>}

    {can(authUser, "ordenes_compra", "Consultar") ? (
      <>
        <div className="oc-filters">
          <div className="field oc-filter-cliente">
            <label className="label" htmlFor="oc-filter-cliente">Cliente</label>
            <select 
              id="oc-filter-cliente" 
              className="select" 
              value={clientFilter} 
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.razon}</option>
              ))}
            </select>
          </div>
          <div className="field oc-filter-estado">
            <label className="label" htmlFor="oc-filter-factura">Factura</label>
            <select 
              id="oc-filter-factura" 
              className="select" 
              value={invoiceFilter} 
              onChange={(e) => setInvoiceFilter(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="con">Con factura</option>
              <option value="sin">Sin factura</option>
            </select>
          </div>
        </div>
        <div className="panel oc-table-panel">
          <table className="dt w-full">
            <thead><tr><th>N° OC</th><th>Cotización</th><th>Cliente</th><th>Fecha</th><th>Tipo de operación</th><th>Factura</th><th>Archivo OC</th><th>Acciones</th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} role="status" style={{ textAlign: "center", padding: "24px" }}>
                    Cargando Órdenes de Compra...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "24px" }}>
                    No hay órdenes para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.idOc}>
                    <td className="oc-id">{order.id}</td>
                    <td>{order.cot || "—"}</td>
                    <td>{order.cliente}</td>
                    <td>{order.fecha}</td>
                    <td>{order.tipoOperacion}</td>
                    <td>
                      {invoiceNumber(order) ? (
                        <Badge t="ok">{invoiceNumber(order)}</Badge>
                      ) : "Sin factura"}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={!can(authUser, "ordenes_compra", "Consultar")}
                        onClick={() => {
                          setPreviewOrder(order)
                          void loadDocument(order)
                        }}
                      >
                        <Ico p={I.pdf} size={13} /> Vista previa
                      </button>
                    </td>
                    <td>
                      <div className="oc-row-actions">
                        <button className="btn btn-ghost btn-sm productos-edit-btn" aria-label={`Editar ${order.id}`} title="Editar orden" disabled={!can(authUser, "ordenes_compra", "Editar")} onClick={() => openEdit(order)}>
                          <Ico p={I.edit} size={13} />
                        </button>
                        {order.cotizacionId != null && (
                          <button 
                            className="btn btn-ghost btn-sm productos-delete-btn" 
                            title="Desasociar cotización"
                            aria-label={`Desasociar cotización de ${order.id}`}
                            disabled={!can(authUser, "ordenes_compra", "Eliminar")} 
                            onClick={() => void unlinkQuote(order)}
                          >
                            <Ico p={I.unlink} size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </>
    ) : (
      <div className="panel" style={{ padding: 24, textAlign: "center" }}>
        No tienes permisos para consultar las órdenes de compra.
      </div>
    )}
    {previewOrder && can(authUser, "ordenes_compra", "Consultar") && <div className="modal-backdrop" onClick={() => setPreviewOrder(null)}>
      <div className="modal oc-modal-wide" role="dialog" aria-modal="true" aria-labelledby="oc-preview-title" onClick={(event) => event.stopPropagation()}>
        <div className="oc-modal-header"><h2 className="oc-modal-title" id="oc-preview-title">Orden de Compra {previewOrder.id}</h2>
          <button className="oc-modal-close" aria-label="Cerrar vista previa" onClick={() => setPreviewOrder(null)}><Ico p={I.x} size={18} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px 18px", margin: "4px 0 14px" }}>
          {[
            ["Cliente", previewOrder.cliente],
            ["Fecha", previewOrder.fecha],
            ["Tipo de operación", previewOrder.tipoOperacion],
            ["Cotización", previewOrder.cot || "Sin cotización"],
            ["Factura", invoiceNumber(previewOrder) || "Sin factura"],
            ...(previewOrder.cotizacionId != null ? [["Total de cotización asociada", fmtCLP(previewOrder.total)]] : []),
          ].map(([label, value], i) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <label className="label" htmlFor={`oc-prev-${i}`} style={{ fontWeight: 700 }}>{label}</label>
              <input id={`oc-prev-${i}`} className="input" value={String(value ?? "")} readOnly style={{ width: "100%", boxSizing: "border-box", background: "#f3f4f6", cursor: "default" }} />
            </div>
          ))}
        </div>
        {renderDocument(previewOrder)}
      </div>
    </div>}

    {showForm && <div className="modal-backdrop" onClick={closeForm}>
      <form className="modal oc-modal-wide" role="dialog" aria-modal="true" aria-labelledby="oc-form-title" onClick={(event) => event.stopPropagation()} onSubmit={saveOrder}>
        <div className="oc-modal-header"><div>
          <h2 className="oc-modal-title" id="oc-form-title">{editingOrder ? "Editar Orden de Compra" : "Importar Orden de Compra"}</h2>
          <p className="oc-modal-subtitle">Completa los datos del documento antes de guardar.</p>
        </div><button type="button" disabled={saving} className="oc-modal-close" aria-label="Cerrar formulario" onClick={closeForm}><Ico p={I.x} size={18} /></button></div>
        <div className="oc-upload-grid">
          {renderDocument(editingOrder)}
          <div>
            <div className="oc-edit-form">
              <div className="field"><label className="label" htmlFor="oc-number">N° Orden de Compra *</label>
                <input id="oc-number" className="input" required maxLength={50} value={form.numero} onChange={(event) => setForm({ ...form, numero: event.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="oc-customer">Cliente *</label>
                <select id="oc-customer" className="select" required value={form.clienteId} disabled={Boolean(editingOrder && (invoiceNumber(editingOrder) || editingOrder.cotizacionId))}
                  onChange={(event) => setForm({ ...form, clienteId: event.target.value })}>
                  <option value="">Seleccionar cliente…</option>
                  {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razon}</option>)}
                </select>
                {editingOrder?.cotizacionId != null && <span className="label">Cotización asociada: {editingOrder.cot}</span>}
              </div>
              <div className="field"><label className="label" htmlFor="oc-date">Fecha *</label>
                <input id="oc-date" className="input" type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="oc-operation">Tipo de operación *</label>
                <select id="oc-operation" className="select" value={form.tipoOperacion} disabled={Boolean(editingOrder && invoiceNumber(editingOrder))}
                  onChange={(event) => setForm({ ...form, tipoOperacion: event.target.value as "Nacional" | "Internacional" })}>
                  <option>Nacional</option><option>Internacional</option>
                </select>
                {editingOrder && invoiceNumber(editingOrder) && <span className="label">Cliente y tipo de operación quedan fijados al facturar.</span>}
              </div>
              <div className="field"><label className="label" htmlFor="oc-pdf">Documento PDF {editingOrder ? "(opcional para reemplazar)" : "*"}</label>
                <button id="oc-pdf" type="button" className="input oc-file-input" disabled={saving || (editingOrder ? !can(authUser, "ordenes_compra", "Editar") : !can(authUser, "ordenes_compra", "Crear / Subir PDF")) } title="Cambiar archivo" onClick={() => pdfField.current?.click()}>
                  {file?.name || editingOrder?.documento.split("/").pop() || "Ningún archivo seleccionado"}
                </button>
                <input ref={pdfField} type="file" accept="application/pdf,.pdf" className="oc-hidden-input" tabIndex={-1}
                  onChange={(event) => { const selected = event.target.files?.[0]; if (selected) selectFile(selected, !editingOrder); event.target.value = "" }} /></div>
              {detectNote && <p className="oc-detect-note" role="status">{detectNote}</p>}
            </div>
            {formError && <p role="alert">{formError}</p>}
            <div className="oc-edit-actions">
              <button className="btn btn-primary" type="submit" disabled={saving || (editingOrder ? !can(authUser, "ordenes_compra", "Editar") : !can(authUser, "ordenes_compra", "Crear / Subir PDF"))}>{saving ? "Guardando…" : "Guardar orden"}</button>
              <button className="btn btn-ghost" type="button" disabled={saving} onClick={closeForm}>Cancelar</button>
            </div>
          </div>
        </div>
      </form>
    </div>}
  </div>
}
