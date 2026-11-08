import { apiFetch } from "../api"
// cotizaciones.tsx
import React, { useState, useEffect, useRef } from "react"
import BrandLogo from "../BrandLogo"
import { getDocumentPdfUrl } from "../documentPdf"
import { AuthUser, authHeaders, can, fmtCLP, I, Ico, PageTitle, Product } from "../shared"

export type Quote = {
  idCotizacion: number
  id: string
  cliente: string
  fecha: string
  vigencia: string
  subtotal: number
  iva: number
  total: number
  observacion: string
  estado: string
  moneda: string 
  fechaAnulacion?: string | null
  motivoAnulacion?: string | null
  usuarioAnulacion?: number | null
}

export type PurchaseOrder = {
  idOc: number
  id: string
  cotizacionId: number | null
  cot: string
  cliente: string
  fecha: string
  total: number
  estado: string
  factura: string | null
}

export type Invoice = {
  id: string
  oc: string
  cliente: string
  fecha: string
  venc: string
  subtotal: number
  iva: number
  total: number
  estado: string
}

type Client = {
  id: number
  razon: string
  ciudad: string
}

type QuoteLine = {
  productId: string
  quantity: string
  unitPrice: string
}

type QuoteDetailLine = {
  codigo_producto: string
  nombre_producto: string
  cantidad_dc: number
  precio_unitario_dc: number
  subtotal_dc: number
  descripcion_dc: string
  unidad_producto: string
}

type QuoteDetail = {
  numero_cotizacion: string
  cliente_nombre: string
  cliente_rut: string
  cliente_telefono: string
  cliente_email: string
  cliente_representante: string
  cliente_pais: string
  cliente_region: string
  cliente_ciudad: string
  cliente_direcciones: Array<{
    calle: string
    ciudad: string
    region: string
    pais: string
    principal: boolean
  }>
  fecha_cotizacion: string
  moneda: string
  vigencia_cotizacion: string
  condicion_pago_cotizacion: string
  subtotal_cotizacion: number
  iva_cotizacion: number
  total_cotizacion: number
  observacion_cotizacion: string
  estado_cotizacion: string
  fecha_anulacion: string | null
  motivo_anulacion: string | null
  id_usuario_anulacion: number | null
  tipo_operacion_cotizacion: "Nacional" | "Internacional"
  detalles: QuoteDetailLine[]
}


export default function Cotizaciones({
  authUser,
  ordenes,
  facturas,
  clientes: clientesProp,
  productos,
  onOrdenesChange,
}: {
  authUser: AuthUser | null
  ordenes: PurchaseOrder[]
  facturas: Invoice[]
  clientes: Client[]
  productos: Product[]
  onOrdenesChange: () => Promise<void>
}) {

  const [show, setShow] = useState(false)
  
  const downloadQuotePdf = async (quote: Quote) => {
    const tab = window.open("about:blank", "_blank")
    if (!tab) { alert("Permite las ventanas emergentes para abrir el PDF."); return }
    tab.opener = null
    tab.document.body.textContent = "Consultando documento..."
    try {
      tab.location.href = await getDocumentPdfUrl(`/api/cotizaciones/${quote.idCotizacion}`, authUser)
    } catch (error) {
      tab.close()
      alert(error instanceof Error ? error.message : "No se pudo abrir el PDF.")
    }
  }
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(true)
  const [quotesError, setQuotesError] = useState("")
  const [clientFilter, setClientFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("sin-anuladas")
  const [quoteToCancel, setQuoteToCancel] = useState<Quote | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [editingQuote, setEditingQuote] = useState<number | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [preview, setPreview] = useState<Quote | null>(null)
  const [detail, setDetail] = useState<QuoteDetail | null>(null)
  const [previewError, setPreviewError] = useState("")
  const previewRequest = useRef(0)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [quoteToLink, setQuoteToLink] = useState<Quote | null>(null)
  const [selectedOrder, setSelectedOrder] = useState("")
  const [linkedOrders, setLinkedOrders] = useState<Record<string, string>>({})
  const [quoteClient, setQuoteClient] = useState("")
  const [quoteAddress, setQuoteAddress] = useState("")
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10))
  const [quoteValidity, setQuoteValidity] = useState("30")
  const [paymentTerm, setPaymentTerm] = useState("30 días")
  const [operationType, setOperationType] = useState<"Nacional" | "Internacional">("Nacional")
  const [savingQuote, setSavingQuote] = useState(false)
  const [currency, setCurrency] = useState("CLP")
  const [quoteStatus, setQuoteStatus] = useState("Borrador")
  const [quoteObservation, setQuoteObservation] = useState("")
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([
    { productId: "", quantity: "", unitPrice: "" },
  ])

  const formatMoney = (value: number, currency: string) => {
    const formatted = fmtCLP(value)
    const suffix = currency === "USD" ? "USD" : "CLP"
    return `${formatted}${suffix}`
  }

  const [editQuoteId, setEditQuoteId] = useState<number | null>(null)
  const [clientes, setClientes] = useState<Client[]>(clientesProp || [])

  useEffect(() => {
    reloadCotizaciones()
    if (!clientesProp || clientesProp.length === 0) {
      loadClientes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadClientes = async () => {
    try {
      const response = await apiFetch("/api/clientes/", { headers: authHeaders(authUser) })
      if (!response.ok) return
      const data = await response.json()
      const items = data.value || data
      const mapped: Client[] = items.map((item: any) => ({
        id: item.id,
        razon: item.razon_social,
        ciudad: item.ciudad,
      }))
      setClientes(mapped)
    } catch (error) {
      console.error("Error cargando clientes:", error)
    }
  }

const reloadCotizaciones = async () => {
  setIsLoadingQuotes(true)
  setQuotesError("")
  try {
    const response = await apiFetch("/api/cotizaciones/", {
      headers: authHeaders(authUser),
    })

    if (!response.ok) throw new Error("No se pudieron cargar las cotizaciones.")

    const data = await response.json()
    const items = data.value || data

    const mapped: Quote[] = items.map((item: any) => ({
      idCotizacion: Number(item.id_cotizacion),
      id: item.numero_cotizacion,
      cliente: item.cliente_nombre || "",
      fecha: item.fecha_cotizacion,
      vigencia: item.vigencia_cotizacion,
      subtotal: Number(item.subtotal_cotizacion),
      iva: Number(item.iva_cotizacion),
      total: Number(item.total_cotizacion),
      observacion: item.observacion_cotizacion || "",
      estado: item.estado_cotizacion === "Convertida" ? "Aceptada" : item.estado_cotizacion,
      moneda: item.moneda || "CLP",
      fechaAnulacion: item.fecha_anulacion,
      motivoAnulacion: item.motivo_anulacion,
      usuarioAnulacion: item.id_usuario_anulacion,
    }))

    setQuotes(mapped)
  } catch (error) {
    setQuotesError("No se pudieron cargar las cotizaciones. Intenta nuevamente.")
  } finally {
    setIsLoadingQuotes(false)
  }
}

  const openPreview = async (quote: Quote) => {
    const requestId = ++previewRequest.current
    setPreview(quote)
    setDetail(null)
    setPreviewError("")
    setIsLoadingDetail(true)
    try {
      const response = await apiFetch(`/api/cotizaciones/${quote.idCotizacion}/`, { headers: authHeaders(authUser) })
      if (!response.ok) throw new Error("No se pudo cargar el detalle de la cotización.")
      const data = await response.json()
      if (requestId === previewRequest.current) setDetail(data)
    } catch (error) {
      if (requestId === previewRequest.current) {
        setPreviewError(error instanceof Error ? error.message : "No se pudo cargar el documento.")
      }
    } finally {
      if (requestId === previewRequest.current) setIsLoadingDetail(false)
    }
  }

  const openEdit = async (quote: Quote) => {
    setEditingQuote(quote.idCotizacion)
    try {
      const detailResp = await apiFetch(`/api/cotizaciones/${quote.idCotizacion}/`, { headers: authHeaders(authUser) })
      if (!detailResp.ok) throw new Error("No se pudo cargar la cotización.")
      
      const data = await detailResp.json()
      
      setEditQuoteId(data.id_cotizacion)
      setQuoteClient(data.cliente_nombre)
      setQuoteAddress(data.cliente_direcciones?.[0]?.ciudad || "")
      setQuoteDate(data.fecha_cotizacion)
      setQuoteValidity(String(data.dias_vigencia_cotizacion || 30))
      setPaymentTerm(data.condicion_pago_cotizacion)
      setQuoteStatus(data.estado_cotizacion)
      setCurrency(data.moneda || "CLP") 
      setOperationType(data.tipo_operacion_cotizacion || "Nacional")
      setQuoteObservation(data.observacion_cotizacion || "")
      
      setQuoteLines(
        data.detalles.map((d: any) => ({
          productId: String(d.id_producto),
          quantity: String(d.cantidad_dc),
          unitPrice: String(d.precio_unitario_dc),
        }))
      )

      setShow(true)
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo cargar la cotización.")
    } finally {
      setEditingQuote(null)
    }
  }

  const activeQuotes = quotes.filter((quote) => quote.estado === "Vigente")
  const acceptedQuotes = quotes.filter((quote) => quote.estado === "Aceptada")
  const expiredQuotes = quotes.filter((quote) => quote.estado === "Vencida")
  const rejectedQuotes = quotes.filter((quote) => quote.estado === "Rechazada") 

  const filteredQuotes = quotes.filter((quote) =>
    (!clientFilter || quote.cliente === clientFilter) &&
    (statusFilter === "sin-anuladas" ? quote.estado !== "Anulada" : !statusFilter || quote.estado === statusFilter),
  )
  const clientOptions = [...new Set(quotes.map((quote) => quote.cliente))].sort((a, b) => a.localeCompare(b, "es"))
  const statusOptions = [...new Set(["Borrador", "Vigente", "Vencida", "Aceptada", "Rechazada", "Anulada", ...quotes.map((quote) => quote.estado)])]
  const totalQuoted = quotes.reduce((sum, quote) => sum + quote.total, 0)

  const getPurchaseOrder = (quote: Quote) =>
    ordenes.find(
      (order) => order.cotizacionId === quote.idCotizacion,
    ) ??
    ordenes.find(
      (order) => linkedOrders[quote.id] === order.id,
    ) ??
    null


  const getInvoice = (quote: Quote) => {
    const order = getPurchaseOrder(quote)
    return order
      ? (facturas.find((invoice) => invoice.oc === order.id) ?? null)
      : null
  }

const linkOrder = async () => {
  if (!quoteToLink) return

  const order = ordenes.find(
    (purchaseOrder) => purchaseOrder.id === selectedOrder,
  )

  if (!order) {
    alert("Selecciona una orden de compra válida.")
    return
  }

  if (
    !Number.isInteger(quoteToLink.idCotizacion) ||
    !Number.isInteger(order.idOc) ||
    order.idOc <= 0
  ) {
    alert(
      "No se encontraron los identificadores reales de la cotización o la orden.",
    )
    return
  }

  const existingOrder = ordenes.find(
    (purchaseOrder) =>
      purchaseOrder.cotizacionId === quoteToLink.idCotizacion &&
      purchaseOrder.idOc !== order.idOc,
  )

  if (existingOrder) {
    alert(
      `Esta cotización ya está asociada a la orden ${existingOrder.id}.`,
    )
    return
  }

  try {
    const response = await apiFetch(
      `/api/ordenes-compra/${order.idOc}/asociar-cotizacion/`,
      {
        method: "POST",
        headers: {
          ...authHeaders(authUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id_cotizacion: quoteToLink.idCotizacion,
        }),
      },
    )

    if (!response.ok) {
      let message = "No se pudo asociar la cotización."

      try {
        const errorData = await response.json()
        message =
          errorData.error ||
          errorData.detail ||
          JSON.stringify(errorData)
      } catch {
        // Conserva el mensaje predeterminado si la respuesta no es JSON.
      }

      alert(message)
      return
    }

    try {
      await onOrdenesChange()
    } catch (refreshError) {
      console.error(
        "La asociación se guardó, pero no se pudieron actualizar las órdenes:",
        refreshError,
      )
    }

    setQuotes((current) =>
      current.map((quote) =>
        quote.idCotizacion === quoteToLink.idCotizacion
          ? { ...quote, estado: "Aceptada" }
          : quote,
      ),
    )

    setQuoteToLink(null)
    setSelectedOrder("")
  } catch (error) {
    console.error("Error asociando cotización:", error)
    alert("No se pudo conectar con el servidor. Revisa tu conexión.")
  }
}

  const originalQuoteStatus = quotes.find((quote) => quote.idCotizacion === editQuoteId)?.estado
  const selectedClient = clientes.find((client) => client.razon === quoteClient)
  const lineSubtotal = quoteLines.reduce(
    (sum, line) => sum + Math.round(Number(line.quantity || 0) * Number(line.unitPrice || 0) * 100) / 100,
    0,
  )
  const ivaRate = operationType === "Internacional" ? 0 : 19
  const lineIva = Math.round(lineSubtotal * ivaRate) / 100
  const lineTotal = lineSubtotal + lineIva

  const resetQuoteForm = () => {
    setEditQuoteId(null)
    setQuoteClient("")
    setQuoteAddress("")
    setQuoteDate(new Date().toISOString().slice(0, 10))
    setQuoteValidity("30")
    setPaymentTerm("30 días")
    setCurrency("CLP")
    setOperationType("Nacional")
    setQuoteStatus("Borrador")
    setQuoteObservation("")
    setQuoteLines([{ productId: "", quantity: "", unitPrice: "" }])
  }

  const closeQuoteForm = () => {
    if (savingQuote) return
    setShow(false)
    resetQuoteForm()
  }

  const saveQuote = async (status = quoteStatus) => {
    if (savingQuote || !quoteClient || !quoteLines.some((line) => line.productId && line.quantity)) return

    const selectedClientObj = clientes.find((c) => c.razon === quoteClient)
    if (!selectedClientObj) {
      alert("Cliente no encontrado")
      return
    }

    const expiration = new Date(quoteDate)
    expiration.setDate(expiration.getDate() + Number(quoteValidity))
    const expirationDate = expiration.toISOString().slice(0, 10)

    const payload = {
      id_cliente: selectedClientObj.id,
      fecha_cotizacion: quoteDate,
      dias_vigencia_cotizacion: Number(quoteValidity),
      vigencia_cotizacion: expirationDate,
      condicion_pago_cotizacion: paymentTerm,
      tipo_operacion_cotizacion: operationType,
      subtotal_cotizacion: lineSubtotal,
      iva_cotizacion: lineIva,
      total_cotizacion: lineTotal,
      observacion_cotizacion: quoteObservation || "",
      estado_cotizacion: status,
      ruta_pdf_cotizacion: "",
      moneda: currency,
      detalles: quoteLines
        .filter((line) => line.productId && line.quantity)
        .map((line) => {
          const product = productos.find((p) => String(p.id) === line.productId)
          const subtotal = Number(line.quantity) * Number(line.unitPrice)
          return {
            id_producto: Number(line.productId),
            descripcion_dc: product?.nombre || "Producto",
            cantidad_dc: Number(line.quantity),
            precio_unitario_dc: Number(line.unitPrice),
            subtotal_dc: subtotal,
          }
        }),
    }

    setSavingQuote(true)
    try {
      const url = editQuoteId ? `/api/cotizaciones/${editQuoteId}/` : "/api/cotizaciones/"
      const method = editQuoteId ? "PUT" : "POST"

      const response = await apiFetch(url, {
        method,
        headers: authHeaders(authUser),
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("Error del backend:", errorData)
        alert(Object.values(errorData).flat().join(" ") || "No se pudo guardar la cotización.")
        return
      }

      const result = await response.json()
      console.log(editQuoteId ? "Cotización actualizada:" : "Cotización creada:", result)

      await reloadCotizaciones()
      setShow(false)
      resetQuoteForm()
      return result
    } catch (error) {
      console.error("Error de red:", error)
      alert("No se pudo conectar con el backend.")
    } finally {
      setSavingQuote(false)
    }
  }

  const cancelQuote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!quoteToCancel || cancelling || !cancelReason.trim()) return
    setCancelling(true)
    setCancelError("")
    try {
      const response = await apiFetch(`/api/cotizaciones/${quoteToCancel.idCotizacion}/anular/`, {
        method: "POST",
        headers: authHeaders(authUser),
        body: JSON.stringify({ motivo_anulacion: cancelReason.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "No se pudo anular la cotización.")
      setQuotes((current) => current.map((quote) => quote.idCotizacion === quoteToCancel.idCotizacion
        ? { ...quote, estado: data.estado_cotizacion, fechaAnulacion: data.fecha_anulacion,
            motivoAnulacion: data.motivo_anulacion, usuarioAnulacion: data.id_usuario_anulacion }
        : quote))
      setQuoteToCancel(null)
      setCancelReason("")
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "No se pudo anular la cotización.")
    } finally {
      setCancelling(false)
    }
  }

  const updateLine = (index: number, changes: Partial<QuoteLine>) => {
    setQuoteLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line,
      ),
    )
  }

  return (
    <div>
      <PageTitle title="Cotizaciones" sub="Ciclo de vida comercial">
        <button
          className="btn btn-primary"
          onClick={() => setShow(true)}
          disabled={!can(authUser, "cotizaciones", "Crear")}
        >
          <Ico p={I.plus} size={14} /> Nueva cotización
        </button>
      </PageTitle>
      {can(authUser, "cotizaciones", "Consultar") ? (
        <>
          <div className="cotizaciones-kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Vigentes</div>
              <div className="kpi-value tabular">{activeQuotes.length}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Aceptadas</div>
              <div className="kpi-value tabular cotizaciones-kpi-positive">
                {acceptedQuotes.length}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Vencidas</div>
              <div className="kpi-value tabular cotizaciones-kpi-negative">
                {expiredQuotes.length}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Rechazadas</div>
              <div className="kpi-value tabular">
                {rejectedQuotes.length}
              </div>
            </div>
          </div>
          <div className="cotizaciones-filters">
            <div className="field cotizaciones-filter-client">
              <label className="label" htmlFor="quote-client-filter">Cliente</label>
              <select 
                id="quote-client-filter" 
                className="select" 
                value={clientFilter} 
                onChange={(event) => setClientFilter(event.target.value)}
              >
                <option value="">Todos los clientes</option>
                {clientOptions.map((name) => (
                  <option key={name} value={name}>{name || "Sin cliente"}</option>
                ))}
              </select>
            </div>
            <div className="field cotizaciones-filter-status">
              <label className="label" htmlFor="quote-status-filter">Estado</label>
              <select 
                id="quote-status-filter" 
                className="select" 
                value={statusFilter} 
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="sin-anuladas">Sin anuladas</option>
                <option value="">Todos los estados</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
          {editingQuote !== null && <p role="status">Cargando cotización para editar…</p>}
          {quotesError && <div role="alert">
            <p>{quotesError}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => void reloadCotizaciones()} disabled={isLoadingQuotes}>Reintentar</button>
          </div>}
          <div className="panel cotizaciones-table-panel" aria-busy={isLoadingQuotes}>
            <div className="table-scroll">
              <table className="dt w-full">
                <thead>
                  <tr>
                    <th>N° Cotización</th>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Vigencia</th>
                    <th>Subtotal</th>
                    <th>IVA</th>
                    <th>Total</th>
                    <th>OC</th>
                    <th>Factura</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingQuotes ? (
                    <tr>
                      <td colSpan={11} role="status" style={{ textAlign: "center", padding: "24px" }}>
                        Cargando Cotizaciones...
                      </td>
                    </tr>
                  ) : filteredQuotes.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", padding: "24px" }}>
                        {quotesError ? "Listado no disponible." : "No hay cotizaciones para los filtros seleccionados."}
                      </td>
                    </tr>
                  ) : filteredQuotes.map((quote) => (
                    <tr key={quote.id}>
                      {(() => {
                        const order = getPurchaseOrder(quote)
                        const invoice = getInvoice(quote)

                        return (
                          <>
                            <td className="cotizaciones-table-id">{quote.id}</td>
                            <td>{quote.cliente}</td>
                            <td>{quote.fecha}</td>
                            <td>{quote.vigencia}</td>
                            <td>{formatMoney(quote.subtotal, quote.moneda || "CLP")}</td>
                            <td>{formatMoney(quote.iva, quote.moneda || "CLP")}</td>
                            <td>{formatMoney(quote.total, quote.moneda || "CLP")}</td>
                            <td>{order?.id ?? "—"}</td>
                            <td>{invoice?.id ?? "—"}</td>
                            <td>
                              <span className={`badge cotizaciones-status cotizaciones-status-${quote.estado.toLowerCase()}`}>
                                {quote.estado}
                              </span>
                            </td>
                            <td>
                              <div className="cotizaciones-row-actions">
                                <button
                                  className="btn btn-ghost btn-sm cotizaciones-action-edit"
                                  title="Editar productos"
                                  aria-label={`Editar ${quote.id}`}
                                  disabled={editingQuote !== null || !["Borrador", "Vigente"].includes(quote.estado) || !can(authUser, "cotizaciones", "Editar")}
                                  onClick={() => openEdit(quote)}
                                >
                                  <Ico p={I.edit} size={13} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm cotizaciones-action-preview"
                                  title="Vista previa"
                                  aria-label={`Vista previa ${quote.id}`}
                                  onClick={() => openPreview(quote)}
                                  disabled={!can(authUser, "cotizaciones", "Consultar")}
                                >
                                  <Ico p={I.pdf} size={13} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm cotizaciones-action-download"
                                  title="Descargar PDF"
                                  aria-label={`Descargar PDF ${quote.id}`}
                                  onClick={() => downloadQuotePdf(quote)}
                                  disabled={!can(authUser, "cotizaciones", "Descargar PDF")}
                                >
                                  <Ico p={I.download} size={13} />
                                </button>
                                {/* BOTÓN DE CORREO ELIMINADO */}
                                <button
                                  className="btn btn-ghost btn-sm cotizaciones-action-link"
                                  title="Asociar a orden de compra"
                                  aria-label={`Asociar ${quote.id} a una orden de compra`}
                                  disabled={quote.estado !== "Aceptada" || Boolean(order) || !can(authUser, "ordenes_compra", "Editar")}
                                  onClick={() => setQuoteToLink(quote)}
                                >
                                  <Ico p={I.link} size={13} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm productos-delete-btn"
                                  title="Anular cotización"
                                  aria-label={`Anular ${quote.id}`}
                                  disabled={!can(authUser, "cotizaciones", "Eliminar") || Boolean(order) ||
                                    !(["Borrador", "Vigente", "Vencida"].includes(quote.estado) ||
                                      (quote.estado === "Aceptada" && authUser?.id_rol === 1))}
                                  onClick={() => {
                                    setQuoteToCancel(quote)
                                    setCancelReason("")
                                    setCancelError("")
                                  }}
                                >
                                  <Ico p={I.trash} size={13} />
                                </button>
                              </div>
                            </td>
                          </>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="panel" style={{ padding: 24, textAlign: "center" }}>
          No tienes permisos para consultar las cotizaciones.
        </div>
      )}
      {show && (
        <div className="modal-backdrop" onClick={closeQuoteForm}>
          <div
            className="modal cotizaciones-modal cotizaciones-modal-wide"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cotizaciones-modal-head">
              <div>
                <h2 className="cotizaciones-modal-title">
                  {editQuoteId ? "Editar Cotización" : "Nueva Cotización"}
                </h2>
                <p className="cotizaciones-modal-subtitle">
                  {editQuoteId ? "Modificando productos y datos" : "Nueva cotización"} · {quoteStatus}
                </p>
              </div>
              <button
                onClick={closeQuoteForm}
                aria-label="Cerrar"
                className="cotizaciones-modal-close"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>
            <div className="cotizaciones-grid-2">
              <div className="field">
                <label className="label">Cliente *</label>
                <select
                  className="select"
                  value={quoteClient}
                  onChange={(event) => {
                    setQuoteClient(event.target.value)
                    setQuoteAddress("")
                  }}
                  disabled={!!editQuoteId}
                >
                  <option value="">Seleccionar cliente…</option>
                  {clientes.map((client) => (
                    <option key={client.id}>{client.razon}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Dirección de despacho *</label>
                <select
                  className="select"
                  value={quoteAddress}
                  onChange={(event) => setQuoteAddress(event.target.value)}
                  disabled={!selectedClient}
                >
                  <option value="">Seleccionar dirección…</option>
                  {selectedClient && (
                    <option value={selectedClient.ciudad}>
                      {selectedClient.ciudad} · Dirección principal
                    </option>
                  )}
                </select>
              </div>
              <div className="field">
                <label className="label">Fecha</label>
                <input
                  className="input"
                  type="date"
                  value={quoteDate}
                  onChange={(event) => setQuoteDate(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Vigencia</label>
                <select
                  className="select"
                  value={quoteValidity}
                  onChange={(event) => setQuoteValidity(event.target.value)}
                >
                  <option value="30">30 días</option>
                  <option value="15">15 días</option>
                  <option value="45">45 días</option>
                  <option value="60">60 días</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Condición de pago</label>
                <select
                  className="select"
                  value={paymentTerm}
                  onChange={(event) => setPaymentTerm(event.target.value)}
                >
                  <option>30 días</option>
                  <option>60 días</option>
                  <option>Contado</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Moneda</label>
                <select
                  className="select"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option>CLP</option>
                  <option>USD</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="quote-operation">Tipo de operación *</label>
                <select id="quote-operation" className="select" value={operationType}
                  onChange={(event) => setOperationType(event.target.value as "Nacional" | "Internacional")}>
                  <option>Nacional</option>
                  <option>Internacional</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Estado *</label>
                <select
                  className="select"
                  value={quoteStatus}
                  onChange={(event) => setQuoteStatus(event.target.value)}
                >
                  <option disabled={Boolean(editQuoteId) && originalQuoteStatus !== "Borrador"}>Borrador</option>
                  <option>Vigente</option>
                  <option disabled={Boolean(editQuoteId) && originalQuoteStatus === "Borrador"}>Vencida</option>
                  <option disabled={Boolean(editQuoteId) && originalQuoteStatus === "Borrador"}>Aceptada</option>
                  <option disabled={Boolean(editQuoteId) && originalQuoteStatus === "Borrador"}>Rechazada</option>
                  <option value="Anulada" disabled>Anulada (usar botón Anular)</option>
                </select>
              </div>
            </div>
            <div className="cotizaciones-lines">
              <div className="cotizaciones-lines-header">
                <strong>Productos / Servicios</strong>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setQuoteLines((current) => [
                      ...current,
                      { productId: "", quantity: "", unitPrice: "" },
                    ])
                  }
                >
                  <Ico p={I.plus} size={13} /> Agregar línea
                </button>
              </div>
              <div className="cotizaciones-lines-grid cotizaciones-lines-grid-head">
                <span>Producto</span>
                <span>Cant.</span>
                <span>P. Unit. ({currency})</span>
                <span>Subtotal</span>
                <span />
              </div>
              {quoteLines.map((line, index) => {
                const product = productos.find((item) => String(item.id) === line.productId)
                const subtotal = Number(line.quantity || 0) * Number(line.unitPrice || 0)
                return (
                  <div key={index} className="cotizaciones-lines-grid">
                    <select
                      className="select"
                      value={line.productId}
                      onChange={(event) =>
                        updateLine(index, { productId: event.target.value })
                      }
                    >
                      <option value="">Seleccionar producto…</option>
                      {productos.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.codigo} · {item.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      placeholder="0"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, { quantity: event.target.value })
                      }
                    />
                    <input
                      className="input"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(index, { unitPrice: event.target.value })
                      }
                    />
                    <span className="cotizaciones-line-subtotal">
                      {product ? fmtCLP(subtotal) : "$0"}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Eliminar línea"
                      aria-label="Eliminar línea"
                      disabled={quoteLines.length === 1}
                      onClick={() =>
                        setQuoteLines((current) =>
                          current.filter((_, lineIndex) => lineIndex !== index),
                        )
                      }
                    >
                      <Ico p={I.trash} size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="field cotizaciones-observation">
              <label className="label">Observaciones</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Notas adicionales de la cotización"
                value={quoteObservation}
                onChange={(event) => setQuoteObservation(event.target.value)}
              />
            </div>
            <div className="cotizaciones-summary">
              <span>
                Subtotal neto <strong>{fmtCLP(lineSubtotal)}</strong>
              </span>
              <span>
                IVA ({ivaRate}%) <strong>{fmtCLP(lineIva)}</strong>
              </span>
              <strong className="cotizaciones-summary-total">
                Total{" "}
                <span className="cotizaciones-summary-total-value">
                  {fmtCLP(lineTotal)}
                </span>
              </strong>
            </div>
            <div className="cotizaciones-summary-actions">
              <button
                className="btn btn-primary"
                disabled={
                  savingQuote ||
                  !quoteClient ||
                  !quoteAddress ||
                  !quoteLines.some(line => line.productId && line.quantity) ||
                  (editQuoteId
                    ? !can(authUser, "cotizaciones", "Editar")
                    : !can(authUser, "cotizaciones", "Crear"))
                }
                onClick={() => saveQuote(quoteStatus === "Borrador" ? "Vigente" : quoteStatus)}
              >
                <Ico p={I.check} size={14} /> {editQuoteId ? "Actualizar cotización" : "Emitir cotización"}
              </button>
              <button
                className="btn cotizaciones-save-draft"
                disabled={
                  savingQuote ||
                  !quoteClient ||
                  !quoteAddress ||
                  !quoteLines.some(line => line.productId && line.quantity) ||
                  (editQuoteId
                    ? !can(authUser, "cotizaciones", "Editar")
                    : !can(authUser, "cotizaciones", "Crear"))
                }
                onClick={() => saveQuote(editQuoteId ? quoteStatus : "Borrador")}
              >
                <Ico p={I.check} size={14} /> {editQuoteId ? "Guardar cambios" : "Guardar borrador"}
              </button>
              <button className="btn btn-ghost" disabled={savingQuote} onClick={async () => {
                const tab = window.open("about:blank", "_blank")
                if (!tab) { alert("Permite las ventanas emergentes para abrir el PDF."); return }
                tab.opener = null
                tab.document.body.textContent = "Guardando cotización y generando PDF..."
                try {
                  const saved = await saveQuote()
                  if (!saved) { tab.close(); return }
                  tab.location.href = await getDocumentPdfUrl(`/api/cotizaciones/${saved.id_cotizacion}`, authUser)
                } catch (error) {
                  tab.close()
                  alert(error instanceof Error ? error.message : "No se pudo abrir el PDF.")
                }
              }}>
                <Ico p={I.download} size={14} /> Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div
            className="modal cotizaciones-modal cotizaciones-preview-modal"
            role="dialog" aria-modal="true" aria-labelledby="quote-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cotizaciones-preview-head">
              <div>
                <h2 id="quote-preview-title" style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>
                  Cotización {preview.id}
                </h2>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadQuotePdf(preview)} disabled={!can(authUser, "cotizaciones", "Descargar PDF")}>
                  <Ico p={I.download} size={14} /> Imprimir / PDF
                </button>
                <button aria-label="Cerrar vista previa" onClick={() => setPreview(null)} className="cotizaciones-modal-close" style={{ position: "static" }}>
                  <Ico p={I.x} size={18} />
                </button>
              </div>
            </div>

            <div className="cotizaciones-preview-body">
              {isLoadingDetail ? (
                <p style={{ textAlign: "center", padding: "2rem" }}>Cargando documento...</p>
              ) : detail ? (
                <div className="cotizaciones-document">
                  
                  {/* HEADER DEL DOCUMENTO */}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "1.5rem", borderBottom: "2px solid #000" }}>
                    <div>
                      <div className="cotizaciones-document-logo">
                        <BrandLogo />
                      </div>
                      <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Ecoterra LLC.</div>
                      <div style={{ fontSize: "0.85rem" }}>600 CLEVELAND STREET STE 393 OFC 665</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.5rem" }}>COTIZACIÓN</div>
                      <div style={{ fontSize: "1rem", fontWeight: "bold" }}>{detail.numero_cotizacion}</div>
                      <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                        <strong>EMISIÓN:</strong> {detail.fecha_cotizacion}
                      </div>
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>VIGENCIA:</strong> {detail.vigencia_cotizacion}
                      </div>
                      <div>Estado: {detail.estado_cotizacion}</div>
                    </div>
                  </div>

                  {/* BLOQUE CLIENTE */}
                  <div style={{ display: "flex", borderBottom: "2px solid #000" }}>
                    <div style={{ flex: 2, padding: "1.5rem", borderRight: "2px solid #000", fontSize: "0.9rem" }}>
                      <div style={{ fontWeight: "bold", marginBottom: "0.5rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Cliente:</div>
                      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{detail.cliente_nombre}</div>
                      {detail.cliente_rut && <div style={{ marginBottom: "0.25rem" }}>RUT: {detail.cliente_rut}</div>}
                      <div style={{ marginBottom: "0.25rem" }}>Representante: {detail.cliente_representante || "—"}</div>
                      <div>{[detail.cliente_pais, detail.cliente_region, detail.cliente_ciudad].filter(Boolean).join(" · ")}</div>
                      
                      {detail.cliente_direcciones && detail.cliente_direcciones.length > 0 && (
                        <div style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                          {detail.cliente_direcciones.map((dir, idx) => (
                             <div key={idx}>
                               {dir.calle}, {dir.ciudad}, {dir.region}, {dir.pais}
                             </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, padding: "1.5rem", fontSize: "0.9rem" }}>
                      <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                        <span style={{ width: "60px", fontWeight: "bold" }}>FONO:</span>
                        <span>{detail.cliente_telefono || "—"}</span>
                      </div>
                      <div style={{ display: "flex" }}>
                        <span style={{ width: "60px", fontWeight: "bold" }}>MAIL:</span>
                        <span>{detail.cliente_email || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* TABLA DE PRODUCTOS */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #000" }}>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "52px" }}>ÍTEM</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "80px" }}>CÓDIGO</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", textAlign: "left" }}>DESCRIPCIÓN</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "100px" }}>CANTIDAD</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "100px" }}>PRECIO UNITARIO</th>
                        <th style={{ padding: "0.5rem", width: "120px" }}>IMPORTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.detalles.map((line, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "center", borderRight: "1px solid #000" }}>{idx + 1}</td>
                          <td style={{ padding: "0.5rem", textAlign: "center", borderRight: "1px solid #000" }}>{line.codigo_producto}</td>
                          <td style={{ padding: "0.5rem", borderRight: "1px solid #000" }}>{line.nombre_producto}{line.descripcion_dc && line.descripcion_dc !== line.nombre_producto && <div>{line.descripcion_dc}</div>}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", borderRight: "1px solid #000" }}>{Number(line.cantidad_dc).toLocaleString('es-CL')} {line.unidad_producto}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", borderRight: "1px solid #000" }}>{formatMoney(Number(line.precio_unitario_dc), detail.moneda || "CLP")}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>{formatMoney(Number(line.subtotal_dc), detail.moneda || "CLP")}</td>
                        </tr>
                      ))}
                      {Array.from({ length: Math.max(0, 5 - detail.detalles.length) }).map((_, i) => (
                        <tr key={`empty-${i}`} style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "1rem", borderRight: "1px solid #000" }}>&nbsp;</td>
                          <td style={{ borderRight: "1px solid #000" }}></td>
                          <td style={{ borderRight: "1px solid #000" }}></td>
                          <td style={{ borderRight: "1px solid #000" }}></td>
                          <td style={{ borderRight: "1px solid #000" }}></td>
                          <td></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* TOTALES */}
                  <div style={{ display: "flex", justifyContent: "flex-end", borderBottom: "2px solid #000" }}>
                    <table style={{ width: "300px", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", borderRight: "2px solid #000" }}>
                            SUBTOTAL NETO
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>
                            {formatMoney(Number(detail.subtotal_cotizacion), detail.moneda || "CLP")}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", borderRight: "2px solid #000" }}>
                            IVA ({detail.tipo_operacion_cotizacion === "Internacional" ? 0 : 19}%)
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>
                            {formatMoney(Number(detail.iva_cotizacion), detail.moneda || "CLP")}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", fontSize: "1.1rem", borderRight: "2px solid #000" }}>
                            TOTAL
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", fontSize: "1.1rem" }}>
                            {formatMoney(Number(detail.total_cotizacion), detail.moneda || "CLP")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* OBSERVACIONES / NOTAS */}
                  <div style={{ padding: "1.5rem", minHeight: "120px", fontSize: "0.85rem" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "0.5rem", textTransform: "uppercase" }}>OBSERVACIONES:</div>
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {detail.observacion_cotizacion || "Sin observaciones adicionales."}
                    </p>
                    <br />
                    <div style={{ fontWeight: "bold" }}>Condición de Pago:</div>
                    <p style={{ margin: 0 }}>{detail.condicion_pago_cotizacion}</p>
                    <p>Tipo de operación: {detail.tipo_operacion_cotizacion || "Nacional"}</p>
                    {detail.estado_cotizacion === "Anulada" && <div>
                      <p>Motivo de anulación: {detail.motivo_anulacion || "Sin registrar"}</p>
                      <p>Fecha de anulación: {detail.fecha_anulacion ? new Date(detail.fecha_anulacion).toLocaleString("es-CL") : "Sin registrar"}</p>
                      <p>Usuario responsable: {detail.id_usuario_anulacion ?? "Sin registrar"}</p>
                    </div>}
                  </div>

                </div>
              ) : (
                <div role="alert">
                  <p>{previewError || "No se pudo cargar el detalle."}</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => void openPreview(preview)}>Reintentar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {quoteToCancel && (
        <div className="modal-backdrop">
          <form className="modal cotizaciones-modal cotizaciones-cancel-modal" role="dialog" aria-modal="true"
            aria-labelledby="cancel-quote-title" onSubmit={cancelQuote}>
            <h2 id="cancel-quote-title">¿Anular esta cotización?</h2>
            <p>{quoteToCancel.id} dejará de estar vigente, pero permanecerá registrada en el historial del sistema.</p>
            <div className="field">
              <label className="label" htmlFor="cancel-quote-reason">Motivo de anulación *</label>
              <textarea id="cancel-quote-reason" className="textarea" required autoFocus
                value={cancelReason} disabled={cancelling}
                onChange={(event) => setCancelReason(event.target.value)} />
            </div>
            {cancelError && <p role="alert">{cancelError}</p>}
            <div className="cotizaciones-summary-actions">
              <button type="button" className="btn btn-ghost" disabled={cancelling}
                onClick={() => setQuoteToCancel(null)}>Cancelar</button>
              <button type="submit" className="btn btn-danger" disabled={cancelling || !cancelReason.trim()}>
                {cancelling ? "Anulando…" : "Confirmar anulación"}
              </button>
            </div>
          </form>
        </div>
      )}

      {quoteToLink && (
        <div className="modal-backdrop" onClick={() => setQuoteToLink(null)}>
          <div
            className="modal cotizaciones-modal cotizaciones-link-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="cotizaciones-link-title">Asociar Orden de Compra</h2>
            <p className="cotizaciones-link-subtitle">
              Selecciona una OC existente para {quoteToLink.id}.
            </p>
            <div className="field">
              <label className="label">Orden de Compra *</label>
              <select
                className="select"
                value={selectedOrder}
                onChange={(event) => setSelectedOrder(event.target.value)}
              >
                <option value="">Seleccionar OC…</option>
                {ordenes.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.id} · {order.cliente} · {fmtCLP(order.total)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cotizaciones-link-actions">
              <button
                className="btn btn-primary"
                disabled={!selectedOrder}
                onClick={linkOrder}
                disabled={
                  !can(authUser, "cotizaciones", "Asociar a Orden de Compra")
                }
              >
                <Ico p={I.link} size={14} /> Asociar OC
              </button>
              <button className="btn btn-ghost" onClick={() => setQuoteToLink(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
