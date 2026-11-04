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
  ordenes, facturas, clientes, authUser, onOrdenesChange, onFacturar,
}: {
  ordenes: PurchaseOrder[]
  facturas: Invoice[]
  clientes: { id: number; razon: string }[]
  authUser: AuthUser | null
  onOrdenesChange: () => Promise<void>
  onFacturar: () => void
}) {
  const [orders, setOrders] = useState(ordenes)
  const [clientFilter, setClientFilter] = useState("")
  const [invoiceFilter, setInvoiceFilter] = useState("")
  const [pageError, setPageError] = useState("")
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
  const fileInput = useRef<HTMLInputElement>(null)
  const documentRequest = useRef(0)

  useEffect(() => setOrders(ordenes), [ordenes])
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
    const requestId = ++documentRequest.current
    setDocumentUrl("")
    setDocumentError("")
    setDocumentLoading(true)
    try {
      const response = await fetch(`/api/ordenes-compra/${order.idOc}/documento/`, {
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

  const selectFile = (selected: File) => {
    if (selected.size > 25 * 1024 * 1024 || !selected.name.toLowerCase().endsWith(".pdf")) {
      setFormError("Selecciona un PDF de hasta 25 MB.")
      setFile(null)
      return
    }
    setFormError("")
    setFile(selected)
  }

  const openNewFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    setEditingOrder(null)
    setForm({ ...emptyForm, fecha: new Date().toISOString().slice(0, 10) })
    setFile(null)
    setDocumentUrl("")
    setDocumentError("")
    documentRequest.current++
    setDocumentLoading(false)
    setShowForm(true)
    selectFile(selected)
    event.target.value = ""
  }

  const openEdit = (order: PurchaseOrder) => {
    setEditingOrder(order)
    setForm({ numero: order.id, clienteId: String(order.clienteId), fecha: order.fecha, tipoOperacion: order.tipoOperacion })
    setFile(null)
    setFormError("")
    setShowForm(true)
    void loadDocument(order)
  }

  const closeForm = () => {
    if (saving) return
    setShowForm(false)
    setFile(null)
    documentRequest.current++
  }

  const saveOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
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
      const response = await fetch(editingOrder ? `/api/ordenes-compra/${editingOrder.idOc}/` : "/api/ordenes-compra/", {
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
    if (!window.confirm(`¿Desasociar la cotización ${order.cot} de ${order.id}?`)) return
    setPageError("")
    try {
      const response = await fetch(`/api/ordenes-compra/${order.idOc}/desasociar-cotizacion/`, {
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
      <button className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={!can(authUser, "ordenes_compra", "Crear")}>
        <Ico p={I.upload} size={14} /> Subir OC en PDF
      </button>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="oc-hidden-input" onChange={openNewFile} />
      <button className="btn btn-primary" onClick={onFacturar} disabled={!can(authUser, "facturacion", "Crear")}>
        <Ico p={I.invoice} size={14} /> Ir a facturación
      </button>
    </PageTitle>
    {pageError && <p role="alert">{pageError}</p>}
    <div className="oc-filters">
      <div className="field">
        <label className="label" htmlFor="oc-client-filter">Cliente</label>
        <select id="oc-client-filter" className="select" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razon}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="oc-invoice-filter">Factura</label>
        <select id="oc-invoice-filter" className="select" value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)}>
          <option value="">Todas las órdenes</option><option value="con">Con factura</option><option value="sin">Sin factura</option>
        </select>
      </div>
    </div>
    <div className="panel oc-table-panel">
      <table className="dt w-full">
        <thead><tr><th>N° OC</th><th>Cotización</th><th>Cliente</th><th>Fecha</th><th>Tipo de operación</th><th>Factura</th><th>Archivo OC</th><th>Acciones</th></tr></thead>
        <tbody>
          {filtered.map((order) => <tr key={order.idOc}>
            <td className="oc-id">{order.id}</td><td>{order.cot || "—"}</td><td>{order.cliente}</td><td>{order.fecha}</td>
            <td>{order.tipoOperacion}</td><td>{invoiceNumber(order) ? <Badge t="ok">{invoiceNumber(order)}</Badge> : "Sin factura"}</td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => { setPreviewOrder(order); void loadDocument(order) }}><Ico p={I.pdf} size={13} /> Vista previa</button></td>
            <td><div className="oc-row-actions">
              <button className="btn btn-ghost btn-sm productos-edit-btn" aria-label={`Editar ${order.id}`} disabled={!can(authUser, "ordenes_compra", "Editar")} onClick={() => openEdit(order)}><Ico p={I.edit} size={13} /></button>
              {order.cotizacionId != null && <button className="btn btn-ghost btn-sm" disabled={!can(authUser, "ordenes_compra", "Eliminar")} onClick={() => void unlinkQuote(order)}>Desasociar cotización</button>}
            </div></td>
          </tr>)}
          {!filtered.length && <tr><td colSpan={8}>No hay órdenes para los filtros seleccionados.</td></tr>}
        </tbody>
      </table>
    </div>

    {previewOrder && <div className="modal-backdrop" onClick={() => setPreviewOrder(null)}>
      <div className="modal oc-modal-wide" role="dialog" aria-modal="true" aria-labelledby="oc-preview-title" onClick={(event) => event.stopPropagation()}>
        <div className="oc-modal-header"><h2 className="oc-modal-title" id="oc-preview-title">Orden de Compra {previewOrder.id}</h2>
          <button className="oc-modal-close" aria-label="Cerrar vista previa" onClick={() => setPreviewOrder(null)}><Ico p={I.x} size={18} /></button>
        </div>
        <p>{previewOrder.cliente} · {previewOrder.fecha} · {previewOrder.tipoOperacion}</p>
        <p>Cotización: {previewOrder.cot || "Sin cotización"} · Factura: {invoiceNumber(previewOrder) || "Sin factura"}</p>
        {previewOrder.cotizacionId != null && <p>Total de cotización asociada: {fmtCLP(previewOrder.total)}</p>}
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
                <input id="oc-pdf" className="input" type="file" accept="application/pdf,.pdf" disabled={saving} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) selectFile(selected) }} /></div>
            </div>
            {formError && <p role="alert">{formError}</p>}
            <div className="oc-edit-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar orden"}</button>
              <button className="btn btn-ghost" type="button" disabled={saving} onClick={closeForm}>Cancelar</button>
            </div>
          </div>
        </div>
      </form>
    </div>}
  </div>
}
