// cotizaciones.tsx
import React, { useState, useEffect } from "react"
import { getDocumentPdfUrl } from "../documentPdf"
import { AuthUser, authHeaders, Badge, fmtCLP, I, Ico, PageTitle, Product } from "../shared"

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
}

type QuoteDetail = {
  numero_cotizacion: string
  cliente_nombre: string
  cliente_rut: string
  cliente_telefono: string
  cliente_email: string
  cliente_representante: string
  cliente_direcciones: Array<{
    calle: string
    ciudad: string
    region: string
    pais: string
    principal: boolean
  }>
  fecha_cotizacion: string
  vigencia_cotizacion: string
  condicion_pago_cotizacion: string
  subtotal_cotizacion: number
  iva_cotizacion: number
  total_cotizacion: number
  observacion_cotizacion: string
  estado_cotizacion: string
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
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [preview, setPreview] = useState<Quote | null>(null)
  const [detail, setDetail] = useState<QuoteDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [quoteToLink, setQuoteToLink] = useState<Quote | null>(null)
  const [selectedOrder, setSelectedOrder] = useState("")
  const [linkedOrders, setLinkedOrders] = useState<Record<string, string>>({})
  const [quoteClient, setQuoteClient] = useState("")
  const [quoteAddress, setQuoteAddress] = useState("")
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10))
  const [quoteValidity, setQuoteValidity] = useState("30")
  const [paymentTerm, setPaymentTerm] = useState("30 días")
  const [currency, setCurrency] = useState("CLP")
  const [quoteStatus, setQuoteStatus] = useState("Borrador")
  const [quoteObservation, setQuoteObservation] = useState("")
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([
    { productId: "", quantity: "", unitPrice: "" },
  ])

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
      const response = await fetch("/api/clientes/", { headers: authHeaders(authUser) })
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
  try {
    const response = await fetch("/api/cotizaciones/", {
      headers: authHeaders(authUser),
    })

    if (!response.ok) {
      console.error(
        "Error al cargar cotizaciones:",
        response.status,
        await response.text(),
      )
      return
    }

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
      estado: item.estado_cotizacion,
    }))

    setQuotes(mapped)
  } catch (error) {
    console.error("Error recargando cotizaciones:", error)
  }
}

  const openPreview = async (quote: Quote) => {
    setPreview(quote)
    setDetail(null)
    setIsLoadingDetail(true)
    try {
      const listResp = await fetch("/api/cotizaciones/", { headers: authHeaders(authUser) })
      const listData = await listResp.json()
      const items = listData.value || listData
      const match = items.find((c: any) => c.numero_cotizacion === quote.id)
      
      if (match) {
        const detailResp = await fetch(`/api/cotizaciones/${match.id_cotizacion}/`, { headers: authHeaders(authUser) })
        if (detailResp.ok) {
          const detailData = await detailResp.json()
          setDetail(detailData)
        }
      }
    } catch (error) {
      console.error("Error cargando detalle:", error)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const openEdit = async (quote: Quote) => {
    try {
      const listResp = await fetch("/api/cotizaciones/", { headers: authHeaders(authUser) })
      const listData = await listResp.json()
      const items = listData.value || listData
      const match = items.find((c: any) => c.numero_cotizacion === quote.id)
      
      if (!match) return

      const detailResp = await fetch(`/api/cotizaciones/${match.id_cotizacion}/`, { headers: authHeaders(authUser) })
      if (!detailResp.ok) return
      
      const data = await detailResp.json()
      
      setEditQuoteId(data.id_cotizacion)
      setQuoteClient(data.cliente_nombre)
      setQuoteAddress(data.cliente_direcciones?.[0]?.ciudad || "")
      setQuoteDate(data.fecha_cotizacion)
      setQuoteValidity(String(data.dias_vigencia_cotizacion || 30))
      setPaymentTerm(data.condicion_pago_cotizacion)
      setQuoteStatus(data.estado_cotizacion)
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
      console.error("Error al preparar edición:", error)
    }
  }

  const activeQuotes = quotes.filter((quote) => quote.estado === "Vigente")
  const convertedQuotes = quotes.filter((quote) => quote.estado === "Convertida")
  const expiredQuotes = quotes.filter((quote) => quote.estado === "Vencida")
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
    const response = await fetch(
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
          ? { ...quote, estado: "Convertida" }
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

  const selectedClient = clientes.find((client) => client.razon === quoteClient)
  const lineSubtotal = quoteLines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
    0,
  )
  const lineIva = Math.round(lineSubtotal * 0.19)
  const lineTotal = lineSubtotal + lineIva

  const resetQuoteForm = () => {
    setEditQuoteId(null)
    setQuoteClient("")
    setQuoteAddress("")
    setQuoteDate(new Date().toISOString().slice(0, 10))
    setQuoteValidity("30")
    setPaymentTerm("30 días")
    setCurrency("CLP")
    setQuoteStatus("Borrador")
    setQuoteObservation("")
    setQuoteLines([{ productId: "", quantity: "", unitPrice: "" }])
  }

  const closeQuoteForm = () => {
    setShow(false)
    resetQuoteForm()
  }

  const saveQuote = async (status = quoteStatus) => {
    if (!quoteClient || !quoteLines.some((line) => line.productId && line.quantity)) return

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
      subtotal_cotizacion: lineSubtotal,
      iva_cotizacion: lineIva,
      total_cotizacion: lineTotal,
      observacion_cotizacion: quoteObservation || "",
      estado_cotizacion: status,
      ruta_pdf_cotizacion: "",
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

    try {
      const url = editQuoteId ? `/api/cotizaciones/${editQuoteId}/` : "/api/cotizaciones/"
      const method = editQuoteId ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: authHeaders(authUser),
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("Error del backend:", errorData)
        alert(`Error al ${editQuoteId ? "actualizar" : "guardar"} la cotización. Revisa la consola.`)
        return
      }

      const result = await response.json()
      console.log(editQuoteId ? "Cotización actualizada:" : "Cotización creada:", result)

      await reloadCotizaciones()
      closeQuoteForm()
      return result
    } catch (error) {
      console.error("Error de red:", error)
      alert("No se pudo conectar con el backend.")
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
        <button className="btn btn-primary" onClick={() => setShow(true)}>
          <Ico p={I.plus} size={14} /> Nueva cotización
        </button>
      </PageTitle>
      <div className="cotizaciones-kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vigentes</div>
          <div className="kpi-value tabular">{activeQuotes.length}</div>
          <div className="cotizaciones-kpi-note">
            {fmtCLP(activeQuotes.reduce((sum, quote) => sum + quote.total, 0))} CLP
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Convertidas (mes)</div>
          <div className="kpi-value tabular cotizaciones-kpi-positive">
            {convertedQuotes.length}
          </div>
          <div className="cotizaciones-kpi-note">
            Tasa: {quotes.length ? Math.round((convertedQuotes.length / quotes.length) * 100) : 0}%
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Vencidas</div>
          <div className="kpi-value tabular cotizaciones-kpi-negative">
            {expiredQuotes.length}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor total</div>
          <div className="kpi-value tabular">{fmtCLP(totalQuoted)}</div>
          <div className="cotizaciones-kpi-note">CLP mes actual</div>
        </div>
      </div>
      <div className="panel">
        <table className="dt w-full">
          <thead>
            <tr>
              <th>N° Cotización</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Vigencia</th>
              <th>Subtotal</th>
              <th>IVA</th>
              <th>Total (CLP)</th>
              <th>OC</th>
              <th>Factura</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
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
                      <td>{fmtCLP(quote.subtotal)}</td>
                      <td>{fmtCLP(quote.iva)}</td>
                      <td>{fmtCLP(quote.total)}</td>
                      <td>{order?.id ?? "—"}</td>
                      <td>{invoice?.id ?? "—"}</td>
                      <td>
                        <Badge
                          t={
                            quote.estado === "Convertida"
                              ? "ok"
                              : quote.estado === "Vencida"
                                ? "danger"
                                : "info"
                          }
                        >
                          {quote.estado}
                        </Badge>
                      </td>
                      <td>
                        <div className="cotizaciones-row-actions">
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Editar productos"
                            aria-label={`Editar ${quote.id}`}
                            onClick={() => openEdit(quote)}
                          >
                            <Ico p={I.edit} size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Vista previa"
                            aria-label={`Vista previa ${quote.id}`}
                            onClick={() => openPreview(quote)}
                          >
                            <Ico p={I.pdf} size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Descargar PDF"
                            aria-label={`Descargar PDF ${quote.id}`}
                            onClick={() => downloadQuotePdf(quote)}
                          >
                            <Ico p={I.download} size={13} />
                          </button>
                          {/* BOTÓN DE CORREO ELIMINADO */}
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Asociar a orden de compra"
                            aria-label={`Asociar ${quote.id} a una orden de compra`}
                            onClick={() => setQuoteToLink(quote)}
                          >
                            <Ico p={I.link} size={13} />
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
                <label className="label">Estado *</label>
                <select
                  className="select"
                  value={quoteStatus}
                  onChange={(event) => setQuoteStatus(event.target.value)}
                >
                  <option>Borrador</option>
                  <option>Vigente</option>
                  <option>Vencida</option>
                  <option>Convertida</option>
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
                IVA (19%) <strong>{fmtCLP(lineIva)}</strong>
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
                  !quoteClient ||
                  !quoteAddress ||
                  !quoteLines.some((line) => line.productId && line.quantity)
                }
                onClick={() => saveQuote("Borrador")}
              >
                <Ico p={I.check} size={14} /> {editQuoteId ? "Guardar cambios" : "Guardar borrador"}
              </button>
              <button className="btn btn-ghost" onClick={async () => {
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
              {/* BOTÓN DE CORREO ELIMINADO */}
              <button
                className="btn btn-navy"
                disabled={
                  !quoteClient ||
                  !quoteAddress ||
                  !quoteLines.some((line) => line.productId && line.quantity)
                }
                onClick={() => saveQuote("Vigente")}
              >
                <Ico p={I.check} size={14} /> {editQuoteId ? "Actualizar cotización" : "Emitir cotización"}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div
            className="modal cotizaciones-modal cotizaciones-preview-modal"
            style={{ maxWidth: "900px", width: "100%", padding: 0, overflow: "hidden" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cotizaciones-preview-head" style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>
                  Cotización {preview.id}
                </h2>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadQuotePdf(preview)}>
                  <Ico p={I.download} size={14} /> Imprimir / PDF
                </button>
                <button onClick={() => setPreview(null)} className="cotizaciones-modal-close" style={{ position: "static" }}>
                  <Ico p={I.x} size={18} />
                </button>
              </div>
            </div>

            <div className="documento-container" style={{ padding: "2rem", backgroundColor: "#fff", color: "#000" }}>
              {isLoadingDetail ? (
                <p style={{ textAlign: "center", padding: "2rem" }}>Cargando documento...</p>
              ) : detail ? (
                <div style={{ border: "2px solid #000", maxWidth: "800px", margin: "0 auto" }}>
                  
                  {/* HEADER DEL DOCUMENTO */}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "1.5rem", borderBottom: "2px solid #000" }}>
                    <div>
                      <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "#0f9d58", letterSpacing: "-1px", marginBottom: "0.5rem" }}>
                        EcoTerra
                      </div>
                      <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Ecoterra LLC.</div>
                      <div style={{ fontSize: "0.85rem" }}>600 CLEVELAND STREET STE 393 OFC 665</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.5rem" }}>QUOTE</div>
                      <div style={{ fontSize: "1rem", fontWeight: "bold" }}>{detail.numero_cotizacion}</div>
                      <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                        <strong>DATE:</strong> {detail.fecha_cotizacion}
                      </div>
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>VIGENCIA:</strong> {detail.vigencia_cotizacion}
                      </div>
                    </div>
                  </div>

                  {/* BLOQUE CLIENTE */}
                  <div style={{ display: "flex", borderBottom: "2px solid #000" }}>
                    <div style={{ flex: 2, padding: "1.5rem", borderRight: "2px solid #000", fontSize: "0.9rem" }}>
                      <div style={{ fontWeight: "bold", marginBottom: "0.5rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Customer:</div>
                      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{detail.cliente_nombre}</div>
                      <div style={{ marginBottom: "0.25rem" }}>RUT: {detail.cliente_rut}</div>
                      <div style={{ marginBottom: "0.25rem" }}>Representante: {detail.cliente_representante || "—"}</div>
                      
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
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "40px" }}>ITEM</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "80px" }}>CODE</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", textAlign: "left" }}>DESCRIPTION</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "100px" }}>QUANTITY</th>
                        <th style={{ padding: "0.5rem", borderRight: "1px solid #000", width: "100px" }}>UNIT PRICE</th>
                        <th style={{ padding: "0.5rem", width: "120px" }}>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.detalles.map((line, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "center", borderRight: "1px solid #000" }}>{idx + 1}</td>
                          <td style={{ padding: "0.5rem", textAlign: "center", borderRight: "1px solid #000" }}>{line.codigo_producto}</td>
                          <td style={{ padding: "0.5rem", borderRight: "1px solid #000" }}>{line.nombre_producto}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", borderRight: "1px solid #000" }}>{Number(line.cantidad_dc).toLocaleString('es-CL')}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", borderRight: "1px solid #000" }}>{fmtCLP(Number(line.precio_unitario_dc))}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>{fmtCLP(Number(line.subtotal_dc))}</td>
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
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", borderRight: "2px solid #000" }}>NET VALUE</td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>{fmtCLP(Number(detail.subtotal_cotizacion))}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", borderRight: "2px solid #000" }}>IVA (19%)</td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>{fmtCLP(Number(detail.iva_cotizacion))}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", fontSize: "1.1rem", borderRight: "2px solid #000" }}>TOTAL</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", fontSize: "1.1rem" }}>{fmtCLP(Number(detail.total_cotizacion))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* OBSERVACIONES / NOTAS */}
                  <div style={{ padding: "1.5rem", minHeight: "120px", fontSize: "0.85rem" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "0.5rem", textTransform: "uppercase" }}>NOTES:</div>
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {detail.observacion_cotizacion || "Sin observaciones adicionales."}
                    </p>
                    <br />
                    <div style={{ fontWeight: "bold" }}>Condición de Pago:</div>
                    <p style={{ margin: 0 }}>{detail.condicion_pago_cotizacion}</p>
                  </div>

                </div>
              ) : (
                <p style={{ textAlign: "center", padding: "2rem" }}>No se pudo cargar el detalle.</p>
              )}
            </div>
          </div>
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