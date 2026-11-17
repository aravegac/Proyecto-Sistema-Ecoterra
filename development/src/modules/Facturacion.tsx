import BrandLogo from "../BrandLogo"
import { apiFetch } from "../api"
// src/modules/Facturacion.tsx
import React, { useEffect, useState } from "react"
import { getDocumentPdfUrl } from "../documentPdf"
import {
  Badge,
  formatMoney,
  Currency,
  redondearImporte,
  I,
  Ico,
  PageTitle,
  AuthUser,
  authHeaders,
  can,
} from "../shared"

export type Invoice = {
  id: string
  id_interno?: number
  oc: string
  cliente: string
  fecha: string
  venc: string
  subtotal: number
  iva: number
  total: number
  estado: string
  observacion?: string
  moneda?: Currency
  tipoOperacion?: string
  clienteId?: number
  ocId?: number
  rutaPDF?: string
}

export const mapFacturaFromApi = (data: any): Invoice => ({
  id: String(data.numero_factura ?? data.id),
  id_interno: Number(data.id_factura ?? data.id),
  clienteId: data.cliente_id == null ? undefined : Number(data.cliente_id),
  ocId: data.id_oc == null ? undefined : Number(data.id_oc),
  oc: String(data.oc_numero || ""),
  cliente: data.cliente_nombre || "",
  fecha: String(data.fecha_factura ?? data.fecha_emision ?? ""),
  venc: String(data.fecha_factura ?? data.fecha_emision ?? ""),
  subtotal: Number(data.subtotal_factura ?? data.subtotal ?? 0),
  iva: Number(data.iva_factura ?? data.iva ?? 0),
  total: Number(data.total_factura ?? data.total ?? 0),
  estado: estadoLegible(data.estado_factura ?? data.estado ?? "PENDIENTE"),
  observacion: data.observacion_factura || "",
  tipoOperacion: data.tipo_operacion || "Nacional",
  rutaPDF: data.ruta_pdf_factura || "",
  moneda: data.moneda_factura || "CLP",
})

type InvoiceDetail = {
  id: number
  numero_factura: string
  cliente_id: number
  id_oc: number
  cliente_nombre: string
  cliente_rut: string
  cliente_telefono: string
  cliente_email: string
  cliente_representante: string | null
  cliente_pais: string
  cliente_region: string
  cliente_ciudad: string
  cliente_direcciones: { id: number; nombre: string; calle: string; ciudad: string; region: string; pais: string }[]
  fecha_emision: string
  estado: string
  subtotal: string
  iva: string
  total: string
  oc_numero: string
  tipo_operacion: string
  moneda_factura: Currency
  observacion_factura: string
  ruta_pdf_factura: string
  fecha_anulacion_factura: string | null
  motivo_anulacion_factura: string | null
  id_usuario_anulacion_factura: number | null
  fecha_pago_factura: string | null
  id_usuario_pago_factura: number | null
  detalles_factura: {
    id: number; id_producto: number; producto_nombre: string; producto_codigo: string; producto_unidad: string
    descripcion_df: string; cantidad: string; precio_unitario: string; subtotal_df: string
  }[]
}
type InvoiceAction = "emitir" | "pagar" | "anular"

type ProductoAPI = {
  id: number
  codigo: string
  nombre: string
  unidad: string
  estado?: string | boolean
}

type ClienteOrdenAPI = {
  id?: number | string
  id_cliente?: number | string
  razon_social?: string
  razon_social_cliente?: string
}

type OrdenAPI = {
  id_oc: number | string
  id_cliente: number | string | ClienteOrdenAPI
  numero_oc?: string
  cliente_nombre?: string
  id_cotizacion?: number | string
  fecha_orden?: string
  fecha_oc?: string
  estado?: string
  tipo_operacion_oc?: string
  factura_numero?: string | null
}

type DetalleForm = {
  producto_id: string
  cantidad: string
  precio_unitario: string
}

type FacturacionProps = {
  facturas: Invoice[]
  loading: boolean
  authUser: AuthUser | null
  onCreated: (invoice: Invoice) => void
}

const estadoLegible = (estado: string) => {
  const estados: Record<string, string> = {
    PENDIENTE: "Pendiente",
    EMITIDA: "Emitida",
    ANULADA: "Anulada",
    PAGADA: "Pagada",
    VENCIDA: "Vencida",
  }

  return estados[estado?.toUpperCase()] || estado || "Pendiente"
}

const createDetalle = (): DetalleForm => ({
  producto_id: "",
  cantidad: "1",
  precio_unitario: "",
})

const errorDeRespuesta = (data: any, status: number) => {
  if (!data) return `Error del servidor (HTTP ${status}).`
  if (typeof data === "string") return data

  return (
    Object.entries(data)
      .map(([campo, valor]) => {
        const mensaje = Array.isArray(valor)
          ? valor.map(String).join(", ")
          : typeof valor === "string"
            ? valor
            : JSON.stringify(valor)

        return `${campo}: ${mensaje}`
      })
      .join(" | ") || `Error HTTP ${status}`
  )
}

const extraerLista = (data: any): any[] | null => {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return null
}

const obtenerClienteId = (
  orden: OrdenAPI | undefined,
): string => {
  if (!orden) return ""

  const cliente = orden.id_cliente

  if (typeof cliente === "object" && cliente !== null) {
    const id = cliente.id_cliente ?? cliente.id
    return id === undefined || id === null ? "" : String(id)
  }

  return cliente === undefined || cliente === null
    ? ""
    : String(cliente)
}

const obtenerNombreCliente = (
  orden: OrdenAPI | undefined,
): string => {
  if (!orden) return ""

  if (orden.cliente_nombre) return orden.cliente_nombre
  const cliente = orden.id_cliente

  if (typeof cliente === "object" && cliente !== null) {
    return (
      cliente.razon_social_cliente ??
      cliente.razon_social ??
      ""
    )
  }

  return ""
}

export default function Facturacion({
  facturas,
  loading,
  authUser,
  onCreated,
}: FacturacionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>(facturas)
  const [preview, setPreview] = useState<Invoice | null>(null)
  const [clientFilter, setClientFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [previewDetail, setPreviewDetail] = useState<InvoiceDetail | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState("")
  const [previewRetry, setPreviewRetry] = useState(0)
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null)
  const [editingLoading, setEditingLoading] = useState(false)
  const [invoiceAction, setInvoiceAction] = useState<{ invoice: Invoice; action: InvoiceAction } | null>(null)
  const [actionReason, setActionReason] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionLoading, setActionLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [showNew, setShowNew] = useState(false)

  const [productos, setProductos] = useState<ProductoAPI[]>([])
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenAPI[]>([])
  const [detalles, setDetalles] = useState<DetalleForm[]>([
    createDetalle(),
  ])

  const [monedaFactura, setMonedaFactura] = useState<Currency>("CLP")
  const [observacion, setObservacion] = useState("")
  const [ocDocumentUrl, setOcDocumentUrl] = useState("")
  const [ocDocumentError, setOcDocumentError] = useState("")
  const [ocDocumentLoading, setOcDocumentLoading] = useState(false)
  const [documentRetry, setDocumentRetry] = useState(0)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState("")
  const [errorCarga, setErrorCarga] = useState("")

  useEffect(() => {
    setInvoices(facturas)
  }, [facturas])

  useEffect(() => {
    if (!authUser) {
      setProductos([])
      setOrdenesCompra([])
      setErrorCarga("No se detectó una sesión activa.")
      return
    }

    let cancelado = false

    const cargarDatos = async () => {
      setCargandoDatos(true)
      setErrorCarga("")

      try {
        const headers = authHeaders(authUser)

        const [respuestaProductos, respuestaOrdenes] =
          await Promise.all([
            apiFetch("/api/productos/", { headers }),
            apiFetch("/api/ordenes-compra/", { headers }),
          ])

        const datosProductos = await respuestaProductos
          .json()
          .catch(() => null)

        const datosOrdenes = await respuestaOrdenes
          .json()
          .catch(() => null)

        if (!respuestaProductos.ok) {
          throw new Error(
            errorDeRespuesta(
              datosProductos,
              respuestaProductos.status,
            ),
          )
        }

        if (!respuestaOrdenes.ok) {
          throw new Error(
            errorDeRespuesta(
              datosOrdenes,
              respuestaOrdenes.status,
            ),
          )
        }

        const listaProductos = extraerLista(datosProductos)
        const listaOrdenes = extraerLista(datosOrdenes)

        if (!listaProductos || !listaOrdenes) {
          throw new Error(
            "La API no devolvió listas válidas de productos y órdenes de compra.",
          )
        }

        if (!cancelado) {
          setProductos(listaProductos)
          setOrdenesCompra(listaOrdenes)
        }
      } catch (error) {
        if (!cancelado) {
          setErrorCarga(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar los datos.",
          )
        }
      } finally {
        if (!cancelado) setCargandoDatos(false)
      }
    }

    cargarDatos()

    return () => {
      cancelado = true
    }
  }, [authUser])

  useEffect(() => {
    setOcDocumentUrl("")
    setOcDocumentError("")
    if (!showNew || !ordenSeleccionada) {
      setOcDocumentLoading(false)
      return
    }
    const controller = new AbortController()
    let active = true
    setOcDocumentLoading(true)
    const loadDocument = async () => {
      try {
        const response = await apiFetch(`/api/ordenes-compra/${ordenSeleccionada}/documento/`, {
          headers: authHeaders(authUser), cache: "no-store", signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || "No se pudo abrir el documento de la orden.")
        const url = new URL(data.url, window.location.origin)
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enlace de documento inválido.")
        if (active) setOcDocumentUrl(url.href)
      } catch (error) {
        if (active) setOcDocumentError(error instanceof Error ? error.message : "No se pudo abrir el documento.")
      } finally {
        if (active) setOcDocumentLoading(false)
      }
    }
    void loadDocument()
    return () => { active = false; controller.abort() }
  }, [showNew, ordenSeleccionada, authUser, documentRetry])

  useEffect(() => {
    setPreviewDetail(null)
    setPreviewError("")
    if (!preview) return
    let active = true
    setPreviewLoading(true)
    const load = async () => {
      try {
        const data = await fetchInvoiceDetail(preview)
        if (active) setPreviewDetail(data)
      } catch (error) {
        if (active) setPreviewError(error instanceof Error ? error.message : "No se pudo cargar la factura.")
      } finally {
        if (active) setPreviewLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [preview?.id, preview?.id_interno, authUser, previewRetry])

  const filteredInvoices = invoices.filter((invoice) =>
    (!clientFilter || String(invoice.clienteId ?? invoice.cliente) === clientFilter) &&
    (!statusFilter || invoice.estado.toUpperCase() === statusFilter),
  )
  const clientOptions = [...new Map(invoices.map((invoice) =>
    [String(invoice.clienteId ?? invoice.cliente), invoice.cliente],
  )).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"))
  const editingInvoice = invoices.find((invoice) => invoice.id_interno === editingInvoiceId)

  const invoiceId = async (invoice: Invoice): Promise<number> => {
    if (invoice.id_interno && Number.isInteger(invoice.id_interno)) return invoice.id_interno
    const response = await apiFetch("/api/facturas/", { headers: authHeaders(authUser) })
    const data = await response.json()
    if (!response.ok) throw new Error(errorDeRespuesta(data, response.status))
    const found = extraerLista(data)?.find((item) => item.numero_factura === invoice.id)
    const id = Number(found?.id_factura ?? found?.id)
    if (!Number.isInteger(id) || id <= 0) throw new Error("No se encontró la factura.")
    return id
  }

  const fetchInvoiceDetail = async (invoice: Invoice): Promise<InvoiceDetail> => {
    const id = await invoiceId(invoice)
    const response = await apiFetch(`/api/facturas/${id}/`, { headers: authHeaders(authUser) })
    const data = await response.json()
    if (!response.ok) throw new Error(errorDeRespuesta(data, response.status))
    return data
  }

  const syncInvoice = (data: any) => {
    const saved = mapFacturaFromApi(data)
    setInvoices((current) => [saved, ...current.filter((invoice) => invoice.id !== saved.id)])
    onCreated(saved)
    return saved
  }

  const openEditInvoice = async (invoice: Invoice) => {
    setEditingLoading(true)
    setListError("")
    try {
      const data = await fetchInvoiceDetail(invoice)
      if (data.estado !== "PENDIENTE") throw new Error("Solo se pueden editar facturas pendientes.")
      setEditingInvoiceId(data.id)
      setOrdenSeleccionada(String(data.id_oc))
      setObservacion(data.observacion_factura || "")
      setMonedaFactura(data.moneda_factura || "CLP")
      setDetalles(data.detalles_factura.map((line) => ({
        producto_id: String(line.id_producto), cantidad: String(line.cantidad), precio_unitario: String(line.precio_unitario),
      })))
      setErrorGuardado("")
      setShowNew(true)
    } catch (error) {
      setListError(error instanceof Error ? error.message : "No se pudo cargar la factura.")
    } finally {
      setEditingLoading(false)
    }
  }

  const confirmAction = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!invoiceAction || actionLoading) return
    setActionLoading(true)
    setActionError("")
    try {
      const id = await invoiceId(invoiceAction.invoice)
      const response = await apiFetch(`/api/facturas/${id}/${invoiceAction.action}/`, {
        method: "POST", headers: authHeaders(authUser),
        body: JSON.stringify(invoiceAction.action === "anular" ? { motivo_anulacion_factura: actionReason.trim() } : {}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(errorDeRespuesta(data, response.status))
      syncInvoice(data)
      if (preview?.id_interno === id) setPreviewDetail(data)
      setInvoiceAction(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo completar la acción.")
    } finally {
      setActionLoading(false)
    }
  }

  const ordenActual = ordenesCompra.find(
  (orden) =>
    String(orden.id_oc) === String(ordenSeleccionada),
)

  const clienteId = obtenerClienteId(ordenActual)
  const nombreCliente = obtenerNombreCliente(ordenActual)

  const subtotalCalculado = detalles.reduce(
    (total, detalle) => {
      const cantidad = Number(detalle.cantidad) || 0
      const precio = Number(detalle.precio_unitario) || 0
      return total + redondearImporte(cantidad * precio)
    },
    0,
  )

  const tipoOperacion = ordenActual?.tipo_operacion_oc || "Nacional"
  const ivaRate = tipoOperacion === "Internacional" ? 0 : 19
  const ivaCalculado = redondearImporte(subtotalCalculado * ivaRate / 100)
  const totalCalculado = subtotalCalculado + ivaCalculado

  const emitidas = invoices.filter((invoice) => invoice.estado.toUpperCase() === "EMITIDA").length

  const pagadas = invoices.filter(
    (invoice) =>
      ["Pagada", "PAGADA"].includes(invoice.estado),
  ).length

  const pendientes = invoices.filter(
    (invoice) =>
      ["Pendiente", "PENDIENTE"].includes(invoice.estado),
  ).length

  const anuladas = invoices.filter((invoice) => invoice.estado.toUpperCase() === "ANULADA").length


  const openNewInvoice = () => {
    setEditingInvoiceId(null)
    setOrdenSeleccionada("")
    setObservacion("")
    setMonedaFactura("CLP")
    setDetalles([createDetalle()])
    setErrorGuardado("")
    setErrorCarga("")
    setShowNew(true)
  }

  const closeNewInvoice = () => {
    if (guardando) return
    setShowNew(false)
    setErrorGuardado("")
  }

  const downloadInvoicePdf = async (invoice: Invoice) => {
    if (invoice.estado.toUpperCase() === "PENDIENTE") return
    const tab = window.open("about:blank", "_blank")
    if (!tab) { alert("Permite las ventanas emergentes para abrir el PDF."); return }
    tab.opener = null
    tab.document.body.textContent = "Cargando PDF…"
    try {
      const id = await invoiceId(invoice)
      tab.location.href = await getDocumentPdfUrl(`/api/facturas/${id}`, authUser)
    } catch (error) {
      tab.close()
      alert(error instanceof Error ? error.message : "No se pudo abrir el PDF.")
    }
  }

  const guardarFactura = async () => {
    if (guardando) return
    setErrorGuardado("")

    if (!authUser) {
      setErrorGuardado(
        "No se detectó una sesión activa. Inicia sesión nuevamente.",
      )
      return
    }

    if (!ordenActual || !clienteId) {
      setErrorGuardado(
        "La orden seleccionada no tiene un cliente válido. Vuelve a seleccionarla.",
      )
      return
    }

    if (!detalles.length) {
      setErrorGuardado("Agrega al menos un producto.")
      return
    }

    const detalleInvalido = detalles.some(
      (detalle) =>
        !detalle.producto_id ||
        !detalle.cantidad ||
        !detalle.precio_unitario ||
        !Number.isFinite(Number(detalle.cantidad)) ||
        !Number.isFinite(Number(detalle.precio_unitario)) ||
        Number(detalle.cantidad) <= 0 ||
        Number(detalle.precio_unitario) <= 0,
    )

    if (detalleInvalido) {
      setErrorGuardado(
        "Completa cada producto con una cantidad y un precio unitario mayores que cero.",
      )
      return
    }

    const idsProductos = detalles.map(
      (detalle) => detalle.producto_id,
    )

    if (new Set(idsProductos).size !== idsProductos.length) {
      setErrorGuardado(
        "Hay productos repetidos. Combina sus cantidades en una sola línea.",
      )
      return
    }

    setGuardando(true)

    try {
      const respuesta = await apiFetch(editingInvoiceId ? `/api/facturas/${editingInvoiceId}/` : "/api/facturas/", {
        method: editingInvoiceId ? "PUT" : "POST",
        headers: {
          ...authHeaders(authUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cliente_id: clienteId,
          id_orden_compra: ordenActual.id_oc,
          observacion_factura: observacion,
          moneda_factura: monedaFactura,
          detalles: detalles.map((detalle) => ({
            producto_id: Number(detalle.producto_id),
            cantidad: Number(detalle.cantidad),
            precio_unitario: Number(detalle.precio_unitario),
          })),
        }),
      })

      const data = await respuesta.json().catch(() => null)

      if (!respuesta.ok) {
        throw new Error(
          errorDeRespuesta(data, respuesta.status),
        )
      }

      const facturaCreada = syncInvoice(data)

      setPreview(facturaCreada)
      setShowNew(false)
      setEditingInvoiceId(null)
      setOrdenSeleccionada("")
      setDetalles([createDetalle()])
      setErrorGuardado("")
    } catch (error) {
      setErrorGuardado(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la factura.",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Facturación"
        sub="Registro de facturas asociadas a las órdenes de compra de clientes"
      >
        <button
          className="btn btn-primary"
          disabled={!can(authUser, "facturacion", "Crear")}
          onClick={openNewInvoice}
        >
          <Ico p={I.plus} size={14} /> Nueva factura
        </button>
      </PageTitle>

      <div className="facturacion-kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Emitidas</div>
          <div className="kpi-value tabular">{emitidas}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pagadas</div>
          <div className="kpi-value tabular">{pagadas}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pendientes</div>
          <div className="kpi-value tabular facturacion-warning-value">
            {pendientes}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Anuladas</div>
          <div className="kpi-value tabular facturacion-danger-value">
            {anuladas}
          </div>
        </div>
      </div>

      <div className="cotizaciones-filters">
        <div className="field cotizaciones-filter-client">
          <label className="label" htmlFor="invoice-client-filter">Cliente</label>
          <select id="invoice-client-filter" className="select" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
            <option value="">Todos los clientes</option>
            {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="field cotizaciones-filter-status">
          <label className="label" htmlFor="invoice-status-filter">Estado</label>
          <select id="invoice-status-filter" className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos los estados</option>
            {["PENDIENTE", "EMITIDA", "PAGADA", "ANULADA"].map((state) => <option key={state} value={state}>{estadoLegible(state)}</option>)}
          </select>
        </div>
      </div>
      {listError && <p role="alert">{listError}</p>}
      {editingLoading && <p role="status">Cargando factura para editar…</p>}
      <div className="panel facturacion-table-panel" aria-busy={loading}>
          <table className="dt w-full">
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>OC</th>
                <th>Cliente</th>
                <th>Emisión</th>
                <th>Subtotal</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading || filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} role="status" style={{ textAlign: "center", padding: "24px" }}>
                    {loading ? "Cargando Facturas..." : "No hay facturas para los filtros seleccionados."}
                  </td>
                </tr>
              ) : filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="facturacion-id-cell">
                    {invoice.id}
                  </td>
                  <td>{invoice.oc}</td>
                  <td className="facturacion-client-cell">
                    {invoice.cliente}
                  </td>
                  <td>{invoice.fecha}</td>
                  <td>{formatMoney(invoice.subtotal, invoice.moneda)}</td>
                  <td>{formatMoney(invoice.iva, invoice.moneda)}</td>
                  <td>{formatMoney(invoice.total, invoice.moneda)}</td>
                  <td>
                    <Badge
                      t={
                        ["Pagada", "PAGADA"].includes(invoice.estado)
                          ? "ok"
                          : [
                                "Anulada",
                                "ANULADA",
                                "Vencida",
                                "VENCIDA",
                              ].includes(invoice.estado)
                            ? "danger"
                            : "warn"
                      }
                    >
                      {estadoLegible(invoice.estado)}
                    </Badge>
                  </td>
                  <td>
                    <div className="facturacion-action-group">
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Ver factura"
                        onClick={() => setPreview(invoice)}
                      >
                        <Ico p={I.pdf} size={13} />
                      </button>
                      {/* BOTÓN DE CORREO ELIMINADO */}
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Imprimir o guardar como PDF"
                        disabled={invoice.estado.toUpperCase() === "PENDIENTE" || (!invoice.rutaPDF && (invoice.estado.toUpperCase() === "ANULADA" || !can(authUser, "facturacion", "Editar")))}
                        onClick={() => downloadInvoicePdf(invoice)}
                      >
                        <Ico p={I.download} size={13} />
                      </button>
                      <button className="btn btn-ghost btn-sm productos-edit-btn" aria-label={`Editar ${invoice.id}`}
                        disabled={editingLoading || invoice.estado.toUpperCase() !== "PENDIENTE" || !can(authUser, "facturacion", "Editar")}
                        onClick={() => void openEditInvoice(invoice)}><Ico p={I.edit} size={13} /></button>
                      {(["emitir", "pagar", "anular"] as InvoiceAction[]).map((action) => {
                        const state = invoice.estado.toUpperCase()
                        const allowed = action === "emitir" ? state === "PENDIENTE" : action === "pagar" ? state === "EMITIDA" : ["PENDIENTE", "EMITIDA"].includes(state)
                        const label = action === "emitir" ? "Emitir" : action === "pagar" ? "Marcar pagada" : "Anular"
                        return <button key={action} className={`btn btn-ghost btn-sm ${action === "anular" ? "productos-delete-btn" : ""}`}
                          title={label} aria-label={`${label} ${invoice.id}`}
                          disabled={!allowed || !can(authUser, "facturacion", action === "anular" ? "Eliminar" : "Editar")}
                          onClick={() => { setInvoiceAction({ invoice, action }); setActionReason(""); setActionError("") }}>
                          <Ico p={action === "emitir" ? I.send : action === "pagar" ? I.check : I.trash} size={13} />
                        </button>
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div
            className="modal cotizaciones-modal cotizaciones-preview-modal"
            role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cotizaciones-preview-head">
              <div>
                <h2 id="invoice-preview-title" style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>
                  Factura {preview.id}
                </h2>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="btn btn-ghost btn-sm"
                  disabled={!previewDetail || previewDetail.estado === "PENDIENTE" || (!previewDetail.ruta_pdf_factura && (previewDetail.estado === "ANULADA" || !can(authUser, "facturacion", "Editar")))}
                  onClick={() => { if (previewDetail) void downloadInvoicePdf(mapFacturaFromApi(previewDetail)) }}>
                  <Ico p={I.download} size={14} /> Imprimir / PDF
                </button>
                <button aria-label="Cerrar vista previa de factura" onClick={() => setPreview(null)} className="cotizaciones-modal-close" style={{ position: "static" }}>
                  <Ico p={I.x} size={18} />
                </button>
              </div>
            </div>

            <div className="cotizaciones-preview-body">
              {previewLoading ? (
                <p role="status" style={{ textAlign: "center", padding: "2rem" }}>Cargando documento...</p>
              ) : previewError ? (
                <div role="alert">
                  <p>{previewError}</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreviewRetry((value) => value + 1)}>Reintentar</button>
                </div>
              ) : previewDetail && (
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
                      <div style={{ fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.5rem" }}>FACTURA</div>
                      <div style={{ fontSize: "1rem", fontWeight: "bold" }}>{preview.id}</div>
                      <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                        <strong>EMISIÓN:</strong> {previewDetail.fecha_emision}
                      </div>
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>OC:</strong> {previewDetail.oc_numero || "—"}
                      </div>
                      <div>Estado: {estadoLegible(previewDetail.estado)}</div>
                    </div>
                  </div>

                  {/* BLOQUE CLIENTE */}
                  <div style={{ display: "flex", borderBottom: "2px solid #000" }}>
                    <div style={{ flex: 2, padding: "1.5rem", borderRight: "2px solid #000", fontSize: "0.9rem" }}>
                      <div style={{ fontWeight: "bold", marginBottom: "0.5rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Cliente:</div>
                      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{previewDetail.cliente_nombre}</div>
                      {previewDetail.cliente_rut && <div style={{ marginBottom: "0.25rem" }}>RUT: {previewDetail.cliente_rut}</div>}
                      <div style={{ marginBottom: "0.25rem" }}>Representante: {previewDetail.cliente_representante || "—"}</div>
                      <div>{[previewDetail.cliente_pais, previewDetail.cliente_region, previewDetail.cliente_ciudad].filter(Boolean).join(" · ")}</div>

                      {previewDetail.cliente_direcciones.length > 0 && (
                        <div style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                          {previewDetail.cliente_direcciones.map((dir) => (
                            <div key={dir.id}>
                              {[dir.calle, dir.ciudad, dir.region, dir.pais].filter(Boolean).join(", ")}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, padding: "1.5rem", fontSize: "0.9rem" }}>
                      <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                        <span style={{ width: "60px", fontWeight: "bold" }}>FONO:</span>
                        <span>{previewDetail.cliente_telefono || "—"}</span>
                      </div>
                      <div style={{ display: "flex" }}>
                        <span style={{ width: "60px", fontWeight: "bold" }}>MAIL:</span>
                        <span>{previewDetail.cliente_email || "—"}</span>
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
                      {previewDetail.detalles_factura.map((line, idx) => (
                        <tr key={line.id} style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "center", borderRight: "1px solid #000" }}>{idx + 1}</td>
                          <td style={{ padding: "0.5rem", textAlign: "center", borderRight: "1px solid #000" }}>{line.producto_codigo}</td>
                          <td style={{ padding: "0.5rem", borderRight: "1px solid #000" }}>{line.producto_nombre}{line.descripcion_df && line.descripcion_df !== line.producto_nombre && <div>{line.descripcion_df}</div>}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", borderRight: "1px solid #000" }}>{Number(line.cantidad).toLocaleString("es-CL")} {line.producto_unidad}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", borderRight: "1px solid #000" }}>{formatMoney(Number(line.precio_unitario), previewDetail.moneda_factura || "CLP")}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>{formatMoney(Number(line.subtotal_df), previewDetail.moneda_factura || "CLP")}</td>
                        </tr>
                      ))}
                      {Array.from({ length: Math.max(0, 5 - previewDetail.detalles_factura.length) }).map((_, i) => (
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
                            {formatMoney(Number(previewDetail.subtotal), previewDetail.moneda_factura || "CLP")}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #000" }}>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", borderRight: "2px solid #000" }}>
                            IVA ({previewDetail.tipo_operacion === "Internacional" ? 0 : 19}%)
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right" }}>
                            {formatMoney(Number(previewDetail.iva), previewDetail.moneda_factura || "CLP")}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", fontSize: "1.1rem", borderRight: "2px solid #000" }}>
                            TOTAL
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", fontSize: "1.1rem" }}>
                            {formatMoney(Number(previewDetail.total), previewDetail.moneda_factura || "CLP")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* OBSERVACIONES / NOTAS */}
                  <div style={{ padding: "1.5rem", minHeight: "120px", fontSize: "0.85rem" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "0.5rem", textTransform: "uppercase" }}>OBSERVACIONES:</div>
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {previewDetail.observacion_factura || "Sin observaciones adicionales."}
                    </p>
                    <br />
                    <p style={{ margin: 0 }}>Tipo de operación: {previewDetail.tipo_operacion || "Nacional"}</p>
                    <p style={{ margin: 0 }}>Moneda: {previewDetail.moneda_factura || "CLP"}</p>
                    {previewDetail.estado === "PAGADA" && <div>
                      <p>Fecha de pago: {previewDetail.fecha_pago_factura ? new Date(previewDetail.fecha_pago_factura).toLocaleString("es-CL") : "Sin registrar"}</p>
                      <p>Usuario responsable: {previewDetail.id_usuario_pago_factura ?? "Sin registrar"}</p>
                    </div>}
                    {previewDetail.estado === "ANULADA" && <div>
                      <p>Motivo de anulación: {previewDetail.motivo_anulacion_factura || "Sin registrar"}</p>
                      <p>Fecha de anulación: {previewDetail.fecha_anulacion_factura ? new Date(previewDetail.fecha_anulacion_factura).toLocaleString("es-CL") : "Sin registrar"}</p>
                      <p>Usuario responsable: {previewDetail.id_usuario_anulacion_factura ?? "Sin registrar"}</p>
                    </div>}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {invoiceAction && <div className="modal-backdrop" onClick={() => { if (!actionLoading) setInvoiceAction(null) }}>
        <form className="modal facturacion-modal facturacion-action-modal" role="dialog" aria-modal="true"
          aria-labelledby="invoice-action-title" onClick={(event) => event.stopPropagation()} onSubmit={confirmAction}>
          <h2 id="invoice-action-title" className="facturacion-modal-title">
            {invoiceAction.action === "emitir" ? "¿Emitir esta factura?" : invoiceAction.action === "pagar" ? "¿Marcar esta factura como pagada?" : "¿Anular esta factura?"}
          </h2>
          <p>{invoiceAction.invoice.id}</p>
          <p>{invoiceAction.action === "emitir" ? "Se generará el PDF y sus datos comerciales quedarán bloqueados."
            : invoiceAction.action === "pagar" ? "Confirma que el pago fue recibido. Una factura pagada queda bloqueada para edición y anulación."
            : "La factura dejará de estar vigente y permanecerá en el historial con el motivo y responsable."}</p>
          {invoiceAction.action === "anular" && <div className="field">
            <label className="label" htmlFor="invoice-cancel-reason">Motivo de anulación *</label>
            <textarea id="invoice-cancel-reason" className="textarea" required value={actionReason} disabled={actionLoading}
              onChange={(event) => setActionReason(event.target.value)} />
          </div>}
          {actionError && <p role="alert">{actionError}</p>}
          <div className="facturacion-form-actions">
            <button className="btn btn-ghost" type="button" disabled={actionLoading} onClick={() => setInvoiceAction(null)}>Cancelar</button>
            <button className={`btn ${invoiceAction.action === "anular" ? "btn-danger" : "btn-primary"}`} type="submit"
              disabled={actionLoading || (invoiceAction.action === "anular" && !actionReason.trim())}>
              {actionLoading ? "Procesando…" : invoiceAction.action === "emitir" ? "Confirmar emisión" : invoiceAction.action === "pagar" ? "Confirmar pago" : "Confirmar anulación"}
            </button>
          </div>
        </form>
      </div>}

      {showNew && (
        <div
          className="modal-backdrop"
          onClick={closeNewInvoice}
        >
          <form
            className="modal facturacion-modal facturacion-modal-wide"
            role="dialog" aria-modal="true" aria-labelledby="invoice-form-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => { event.preventDefault(); void guardarFactura() }}
          >
            <div className="facturacion-modal-header">
              <div>
                <h2 className="facturacion-modal-title" id="invoice-form-title">
                  {editingInvoiceId ? "Editar factura pendiente" : "Nueva factura"}
                </h2>
                <p className="facturacion-modal-subtitle facturacion-modal-subtitle-spaced">
                  Selecciona una orden de compra y agrega sus productos.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar formulario de factura"
                onClick={closeNewInvoice}
                className="facturacion-icon-button"
                disabled={guardando}
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>

            {errorCarga && (
              <p
                role="alert"
                style={{ color: "#dc2626", padding: "8px 0" }}
              >
                Error al cargar datos: {errorCarga}
              </p>
            )}

            {errorGuardado && (
              <p
                role="alert"
                style={{ color: "#dc2626", padding: "8px 0" }}
              >
                {errorGuardado}
              </p>
            )}

            {cargandoDatos ? (
              <p>Cargando productos y órdenes de compra...</p>
            ) : (
              <>
                <div className="facturacion-header-grid">
                  <div className="field">
                    <label className="label" htmlFor="invoice-order">Orden de compra *</label>
                    <select
                      className="select"
                      required
                      id="invoice-order"
                      value={ordenSeleccionada}
                      onChange={(event) => {
                        setOrdenSeleccionada(event.target.value)
                        setErrorGuardado("")
                      }}
                    >
                      <option value="">
                        Selecciona una orden
                      </option>
                      {ordenesCompra.map((orden) => (
                        <option
                          key={String(orden.id_oc)}
                          value={String(orden.id_oc)}
                          disabled={(Boolean(orden.factura_numero) && orden.factura_numero !== editingInvoice?.id) || invoices.some((invoice) => invoice.oc === orden.numero_oc && invoice.id_interno !== editingInvoiceId)}
                        >
                          {orden.numero_oc ||
                            `OC #${orden.id_oc}`}
                          {obtenerNombreCliente(orden)
                            ? ` — ${obtenerNombreCliente(orden)}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    {ordenesCompra.length === 0 && (
                      <p className="facturacion-modal-subtitle">
                        No hay órdenes disponibles para esta sesión.
                      </p>
                    )}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="invoice-client">Cliente</label>
                    <input
                      id="invoice-client"
                      className="input"
                      value={
                        nombreCliente ||
                        (clienteId ? `Cliente ${clienteId}` : "")
                      }
                      placeholder="Se obtiene de la orden"
                      readOnly
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="invoice-operation">Tipo de operación</label>
                    <input id="invoice-operation" className="input" readOnly value={ordenActual ? tipoOperacion : ""} placeholder="Se obtiene de la orden" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="invoice-currency">Moneda *</label>
                    <select id="invoice-currency" className="select" value={monedaFactura}
                      onChange={(event) => setMonedaFactura(event.target.value as Currency)}>
                      <option>CLP</option><option>USD</option>
                    </select>
                  </div>
                </div>

                {ordenActual && <section className="facturacion-order-document" aria-label="Documento de la orden seleccionada">
                  <h3>Documento de la OC {ordenActual.numero_oc}</h3>
                  {ocDocumentLoading ? <p role="status">Cargando documento…</p>
                    : ocDocumentUrl ? <>
                      <iframe title="Documento OC seleccionada" src={ocDocumentUrl} className="oc-preview-frame" />
                      <a href={ocDocumentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Abrir documento en otra pestaña</a>
                    </> : <div role="alert">
                      <p>{ocDocumentError || "Documento no disponible."}</p>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDocumentRetry((value) => value + 1)}>Reintentar</button>
                    </div>}
                </section>}

                <div
                  className="field"
                  style={{ marginTop: 16 }}
                >
                  <label className="label">Productos / Servicios</label>

                  {detalles.map((detalle, index) => (
                    <div
                      key={index}
                      className="facturacion-line-grid"
                      style={{ marginBottom: 12 }}
                    >
                      <div className="field">
                        <label className="label" htmlFor={`invoice-product-${index}`}>Producto</label>
                        <select
                          className="select"
                          required
                          id={`invoice-product-${index}`}
                          value={detalle.producto_id}
                          onChange={(event) =>
                            setDetalles((actuales) =>
                              actuales.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      producto_id:
                                        event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="">
                            Selecciona un producto
                          </option>
                          {productos.map((producto) => (
                            <option
                              key={producto.id}
                              value={producto.id}
                            >
                              {producto.codigo} — {producto.nombre}
                              {producto.unidad
                                ? ` (${producto.unidad})`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label className="label" htmlFor={`invoice-quantity-${index}`}>Cantidad</label>
                        <input
                          className="input"
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          id={`invoice-quantity-${index}`}
                          value={detalle.cantidad}
                          onChange={(event) =>
                            setDetalles((actuales) =>
                              actuales.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      cantidad:
                                        event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>

                      <div className="field">
                        <label className="label" htmlFor={`invoice-price-${index}`}>Precio unitario ({monedaFactura})</label>
                        <input
                          className="input"
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          placeholder="Ej. 15000"
                          id={`invoice-price-${index}`}
                          value={detalle.precio_unitario}
                          onChange={(event) =>
                            setDetalles((actuales) =>
                              actuales.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      precio_unitario:
                                        event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>

                      {detalles.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setDetalles((actuales) =>
                              actuales.filter(
                                (_, i) => i !== index,
                              ),
                            )
                          }
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setDetalles((actuales) => [
                        ...actuales,
                        createDetalle(),
                      ])
                    }
                  >
                    <Ico p={I.plus} size={14} /> Agregar producto
                  </button>
                </div>

                <div className="field" style={{ marginTop: 16 }}>
                  <label className="label" htmlFor="invoice-observation">Observación</label>
                  <textarea id="invoice-observation" className="textarea" rows={3} value={observacion} onChange={(event) => setObservacion(event.target.value)} />
                </div>

                <div className="facturacion-summary">
                  <div className="facturacion-preview-totals">
                    <span>Subtotal estimado</span>
                    <span>{formatMoney(subtotalCalculado, monedaFactura)}</span>
                  </div>
                  <div className="facturacion-preview-totals">
                    <span>IVA estimado ({ivaRate}%)</span>
                    <span>{formatMoney(ivaCalculado, monedaFactura)}</span>
                  </div>
                  <div className="facturacion-preview-totals">
                    <strong>Total estimado</strong>
                    <strong>{formatMoney(totalCalculado, monedaFactura)}</strong>
                  </div>

                </div>
              </>
            )}

            <div className="facturacion-form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={guardando || cargandoDatos || Boolean(errorCarga) || !ordenActual}
              >
                <Ico p={I.check} size={14} />
                {guardando ? "Guardando..." : "Guardar factura"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeNewInvoice}
                disabled={guardando}
              >
                Cancelar
              </button>

            </div>
          </form>
        </div>
      )}
    </div>
  )
}
