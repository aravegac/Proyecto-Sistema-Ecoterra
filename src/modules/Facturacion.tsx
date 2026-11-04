// src/modules/Facturacion.tsx
import React, { useEffect, useState } from "react"
import { getDocumentPdfUrl } from "../documentPdf"
import {
  Badge,
  fmtCLP,
  I,
  Ico,
  PageTitle,
  AuthUser,
  authHeaders,
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
  tipoOperacion?: string
}

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

// Usa la misma regla de Decimal del API: redondeo a centavos con mitad al par.
const redondearImporte = (valor: number): number => {
  const centavos = Math.abs(valor) * 100
  const inferior = Math.floor(centavos)
  const mitad = Math.abs(centavos - inferior - 0.5) <= Number.EPSILON * Math.max(1, centavos) * 2
  const redondeado = mitad ? inferior + inferior % 2 : Math.round(centavos)
  return Math.sign(valor) * redondeado / 100
}

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
  authUser,
  onCreated,
}: FacturacionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>(facturas)
  const [preview, setPreview] = useState<Invoice | null>(null)
  const [showNew, setShowNew] = useState(false)

  const [productos, setProductos] = useState<ProductoAPI[]>([])
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenAPI[]>([])
  const [detalles, setDetalles] = useState<DetalleForm[]>([
    createDetalle(),
  ])

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
            fetch("/api/productos/", { headers }),
            fetch("/api/ordenes-compra/", { headers }),
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
        const response = await fetch(`/api/ordenes-compra/${ordenSeleccionada}/documento/`, {
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

  const totalFacturado = invoices.reduce(
    (sum, invoice) =>
      sum + Number(invoice.total ?? invoice.subtotal + invoice.iva),
    0,
  )

  const pagadas = invoices.filter(
    (invoice) =>
      ["Pagada", "PAGADA"].includes(invoice.estado),
  ).length

  const pendientes = invoices.filter(
    (invoice) =>
      ["Pendiente", "PENDIENTE"].includes(invoice.estado),
  ).length

  const vencidas = invoices.filter(
    (invoice) =>
      ["Vencida", "VENCIDA"].includes(invoice.estado),
  ).length


  const openNewInvoice = () => {
    setOrdenSeleccionada("")
    setObservacion("")
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
  const printWindow = window.open("about:blank", "_blank")

  if (!printWindow) {
    alert("Permite las ventanas emergentes para abrir el PDF.")
    return
  }

  if (!authUser) {
    printWindow.close()
    alert("Tu sesión ha expirado. Inicia sesión nuevamente.")
    return
  }

  printWindow.document.title = `Factura ${invoice.id}`
  printWindow.opener = null
  printWindow.document.body.textContent = "Cargando PDF..."

  try {
    const headers = authHeaders(authUser)

    const respuestaFacturas = await fetch("/api/facturas/", {
      headers,
    })

    const datosFacturas = await respuestaFacturas
      .json()
      .catch(() => null)

    if (!respuestaFacturas.ok) {
      throw new Error(
        errorDeRespuesta(datosFacturas, respuestaFacturas.status),
      )
    }

    const listaFacturas = extraerLista(datosFacturas)

    if (!listaFacturas) {
      throw new Error("La API no devolvió una lista de facturas válida.")
    }

    const facturaAPI = listaFacturas.find(
      (item: any) =>
        item.numero_factura === invoice.id
    )

    if (!facturaAPI) {
      throw new Error(
        `No se encontró la factura ${invoice.id} en el backend.`
      )
    }

    const facturaId =
      facturaAPI.id_factura ?? facturaAPI.id

    if (facturaId === undefined || facturaId === null) {
      throw new Error("No se encontró el ID interno de la factura.")
    }

    printWindow.location.href = await getDocumentPdfUrl(`/api/facturas/${facturaId}`, authUser)
  } catch (error) {
    printWindow.close()

    alert(
      error instanceof Error
        ? error.message
        : "No se pudo abrir el PDF de la factura."
    )
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
      const respuesta = await fetch("/api/facturas/", {
        method: "POST",
        headers: {
          ...authHeaders(authUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cliente_id: clienteId,
          id_orden_compra: ordenActual.id_oc,
          observacion_factura: observacion,
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

      const facturaCreada: Invoice = {
        id_interno: Number(data.id_factura ?? data.id),
        observacion: data.observacion_factura || "",
        tipoOperacion: data.tipo_operacion || tipoOperacion,
        id: String(data.numero_factura ?? data.id),
        oc: String(
          data.oc_numero ?? ordenActual.numero_oc ?? ordenActual.id_oc,
        ),
        cliente:
          data.cliente_nombre ||
          nombreCliente ||
          `Cliente ${clienteId}`,
        fecha: String(
          data.fecha_factura ?? data.fecha_emision ?? "",
        ),
        venc: String(data.fecha_factura ?? data.fecha_emision ?? ""),
        subtotal: Number(
          data.subtotal_factura ?? data.subtotal ?? 0,
        ),
        iva: Number(data.iva_factura ?? data.iva ?? 0),
        total: Number(data.total_factura ?? data.total ?? 0),
        estado: estadoLegible(
          data.estado_factura ?? data.estado ?? "PENDIENTE",
        ),
      }

      setInvoices((actuales) => [
        facturaCreada,
        ...actuales.filter(
          (item) => item.id !== facturaCreada.id,
        ),
      ])
      onCreated(facturaCreada)

      setPreview(facturaCreada)
      setShowNew(false)
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
          onClick={openNewInvoice}
        >
          <Ico p={I.plus} size={14} /> Nueva factura
        </button>
      </PageTitle>

      <div className="facturacion-kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Total facturado</div>
          <div className="kpi-value tabular">
            {fmtCLP(totalFacturado)}
          </div>
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
          <div className="kpi-label">Vencidas</div>
          <div className="kpi-value tabular facturacion-danger-value">
            {vencidas}
          </div>
        </div>
      </div>

      <div className="panel">
        {invoices.length === 0 ? (
          <p style={{ padding: 20 }}>
            No hay facturas para mostrar.
          </p>
        ) : (
          <table className="dt w-full">
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>OC</th>
                <th>Cliente</th>
                <th>Emisión</th>
                <th>Subtotal</th>
                <th>IVA</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="facturacion-id-cell">
                    {invoice.id}
                  </td>
                  <td>{invoice.oc}</td>
                  <td className="facturacion-client-cell">
                    {invoice.cliente}
                  </td>
                  <td>{invoice.fecha}</td>
                  <td>{fmtCLP(invoice.subtotal)}</td>
                  <td>{fmtCLP(invoice.iva)}</td>
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
                        onClick={() => downloadInvoicePdf(invoice)}
                      >
                        <Ico p={I.download} size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {preview && (
        <div
          className="modal-backdrop"
          onClick={() => setPreview(null)}
        >
          <div
            className="modal facturacion-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="facturacion-modal-header">
              <div>
                <h2 className="facturacion-modal-title">
                  Vista previa — {preview.id}
                </h2>
                <p className="facturacion-modal-subtitle">
                  Documento electrónico
                </p>
              </div>
              <button
                aria-label="Cerrar vista previa de factura"
                onClick={() => setPreview(null)}
                className="facturacion-icon-button"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>

            <div className="facturacion-preview-card">
              <div className="facturacion-preview-header">
                <strong className="facturacion-preview-brand">
                  Ecoterra
                </strong>
                <strong>{preview.id}</strong>
              </div>
              <p className="facturacion-preview-client">
                {preview.cliente}
              </p>
              <p className="facturacion-preview-meta">
                OC {preview.oc} · Emisión {preview.fecha}
              </p>
              <div className="facturacion-preview-totals">
                <span>SUBTOTAL CLP</span>
                <span>{fmtCLP(preview.subtotal)}</span>
              </div>
              <div className="facturacion-preview-totals">
                <span>IVA ({preview.tipoOperacion === "Internacional" ? 0 : 19}%)</span>
                <span>{fmtCLP(preview.iva)}</span>
              </div>
              <div className="facturacion-preview-totals">
                <span>TOTAL CLP</span>
                <span>
                  {fmtCLP(
                    preview.total ??
                      preview.subtotal + preview.iva,
                  )}
                </span>
              </div>
              <p>Tipo de operación: {preview.tipoOperacion || "Nacional"}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>Observación: {preview.observacion || "Sin observaciones"}</p>
              <div className="facturacion-preview-actions">
                {/* BOTÓN DE CORREO ELIMINADO */}
                <button
                  className="btn btn-ghost"
                  onClick={() => downloadInvoicePdf(preview)}
                >
                  <Ico p={I.download} size={14} /> Imprimir / PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  Nueva factura
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
                          disabled={Boolean(orden.factura_numero) || invoices.some((invoice) => invoice.oc === orden.numero_oc)}
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
                        <label className="label" htmlFor={`invoice-price-${index}`}>Precio unitario (CLP)</label>
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
                    <span>{fmtCLP(subtotalCalculado)}</span>
                  </div>
                  <div className="facturacion-preview-totals">
                    <span>IVA estimado ({ivaRate}%)</span>
                    <span>{fmtCLP(ivaCalculado)}</span>
                  </div>
                  <div className="facturacion-preview-totals">
                    <strong>Total estimado</strong>
                    <strong>{fmtCLP(totalCalculado)}</strong>
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
