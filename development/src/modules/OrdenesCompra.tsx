
import React, { useEffect, useRef, useState } from "react"
import {
  AuthUser,
  authHeaders,
  Badge,
  fmtCLP,
  I,
  Ico,
  PageTitle,
} from "../shared"

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

// Muestra órdenes, permite desasociar cotizaciones y ofrece importación y facturación locales de demostración.
export default function OrdenesCompra({
  ordenes,
  facturas,
  authUser,
  onOrdenesChange,
}: {
  ordenes: PurchaseOrder[]
  facturas: Invoice[]
  authUser: AuthUser | null
  onOrdenesChange: () => Promise<void>
}) {
  const [orders, setOrders] = useState<PurchaseOrder[]>(ordenes)
  const [generatedInvoices, setGeneratedInvoices] = useState<Invoice[]>([])
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState("")
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [previewOrder, setPreviewOrder] = useState<PurchaseOrder | null>(null)

  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("")

  const [detectedOrder, setDetectedOrder] = useState({
    id: "",
    cot: "",
    cliente: "",
    fecha: "",
    total: "",
    factura: "",
  })

  // Mantener sincronizadas las órdenes recibidas desde App.tsx.
  useEffect(/* Sincroniza las órdenes locales con las órdenes recibidas por propiedades. */ () => {
    setOrders(ordenes)
  }, [ordenes])

  const allInvoices = [...facturas, ...generatedInvoices]

  // Busca la factura asociada a la orden por número de orden o número de factura.
  const getInvoice = (order: PurchaseOrder) =>
    allInvoices.find(
      /* Identifica el elemento buscado evaluando invoice.oc === order.id || invoice.id === order.factura. */ (invoice) =>
        invoice.oc === order.id || invoice.id === order.factura,
    )

  // Desasociar una cotización mediante el backend.
  // Pide confirmación y elimina mediante la API la asociación entre la orden y su cotización.
  const desasociarCotizacion = async (order: PurchaseOrder) => {
    if (order.cotizacionId == null) {
      alert("Esta orden no tiene una cotización asociada.")
      return
    }

    const confirmado = window.confirm(
      `¿Deseas desasociar la cotización ${order.cot} de la orden ${order.id}?`,
    )

    if (!confirmado) return

    if (!authUser) {
      alert("Debes iniciar sesión para realizar esta operación.")
      return
    }

    try {
      const response = await fetch(
        `/api/ordenes-compra/${order.idOc}/desasociar-cotizacion/`,
        {
          method: "DELETE",
          headers: authHeaders(authUser),
        },
      )

      if (!response.ok) {
        let mensaje = "No se pudo desasociar la cotización."

        try {
          const data = await response.json()
          mensaje = data.error || data.detail || JSON.stringify(data)
        } catch {
          // Mantener el mensaje predeterminado.
        }

        alert(mensaje)
        return
      }

      // Actualizar las órdenes desde el backend.
      try {
        await onOrdenesChange()
        alert("Cotización desasociada correctamente.")
      } catch (error) {
        console.error(
          "La asociación se quitó, pero no se pudieron actualizar las órdenes:",
          error,
        )
        alert(
          "La asociación se quitó en el servidor, pero no se pudo actualizar la vista. Recarga la página.",
        )
      }
    } catch (error) {
      console.error("Error al desasociar la cotización:", error)
      alert("No se pudo conectar con el servidor.")
    }
  }

  // Carga el PDF seleccionado para vista previa y rellena datos de orden simulados para demostración.
  const handlePdfUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadedPdf(file)
    setPdfPreviewUrl(URL.createObjectURL(file))

    setDetectedOrder({
      id: "OC-2024-042",
      cot: "COT-2024-041",
      cliente: "Minera Los Bronces S.A.",
      fecha: new Date().toISOString().slice(0, 10),
      total: "4250000",
      factura: "",
    })

    setShowUploadModal(true)
    event.target.value = ""
  }

  // Cierra la importación, limpia el archivo seleccionado y libera la URL temporal de vista previa.
  const closeUploadModal = () => {
    setShowUploadModal(false)
    setUploadedPdf(null)

    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl)
    }

    setPdfPreviewUrl("")
  }

  // Importación local de demostración.
  // No registra la orden en la base de datos.
  // Añade o reemplaza la orden importada únicamente en la lista local de demostración.
  const saveUploadedOrder = () => {
    if (!uploadedPdf || !detectedOrder.id || !detectedOrder.cliente) {
      return
    }

    const existingOrder = orders.find(
      /* Identifica el elemento buscado evaluando order.id === detectedOrder.id. */ (order) => order.id === detectedOrder.id,
    )

    const newOrder: PurchaseOrder = {
      idOc: existingOrder?.idOc ?? 0,
      id: detectedOrder.id,
      clienteId: existingOrder?.clienteId ?? 0,
      cotizacionId: existingOrder?.cotizacionId ?? null,
      cot: detectedOrder.cot,
      cliente: detectedOrder.cliente,
      fecha: detectedOrder.fecha,
      total: Number(detectedOrder.total) || 0,
      estado: existingOrder?.estado ?? "Pendiente",
      factura: detectedOrder.factura || null,
    }

    setOrders(/* Calcula el nuevo valor de Orders devolviendo [ newOrder, ...current.filter((order) => order.id !== detectedOrder.id), ]. */ (current) => [
      newOrder,
      ...current.filter(/* Comprueba qué elementos cumplen la condición evaluando order.id !== detectedOrder.id. */ (order) => order.id !== detectedOrder.id),
    ])

    closeUploadModal()
  }

  // Crea una factura local de demostración con IVA y vencimiento a 30 días para la orden seleccionada.
  const generateInvoice = () => {
    const order = orders.find(/* Identifica el elemento buscado evaluando item.id === selectedOrderId. */ (item) => item.id === selectedOrderId)

    if (!order || getInvoice(order)) return

    const subtotal = Math.round(order.total / 1.19)

    const invoiceNumber =
      Math.max(
        ...allInvoices.map(/* Transforma cada elemento de la lista devolviendo Number(invoice.id.replace("FAC-2024-", "")). */ (invoice) =>
          Number(invoice.id.replace("FAC-2024-", "")),
        ),
        0,
      ) + 1

    const issueDate = new Date()
    const dueDate = new Date(issueDate)
    dueDate.setDate(dueDate.getDate() + 30)

    // Convierte una fecha a su parte de calendario UTC con formato AAAA-MM-DD.
    const formatDate = (date: Date) =>
      date.toISOString().slice(0, 10)

    setGeneratedInvoices(/* Calcula el nuevo valor de GeneratedInvoices devolviendo [ ...current, { id: `FAC-2024-${String(invoiceNumber).padStart(3, "0")}`, oc: order.id, cliente: order.cliente, fecha: formatDate(issueDate), venc: formatDate(dueDate), subtotal, iva: order.total - subtotal, total: order.total, estado: "Pendiente", }, ]. */ (current) => [
      ...current,
      {
        id: `FAC-2024-${String(invoiceNumber).padStart(3, "0")}`,
        oc: order.id,
        cliente: order.cliente,
        fecha: formatDate(issueDate),
        venc: formatDate(dueDate),
        subtotal,
        iva: order.total - subtotal,
        total: order.total,
        estado: "Pendiente",
      },
    ])

    setShowInvoiceModal(false)
    setSelectedOrderId("")
  }

  return (
    <div>
      <PageTitle
        title="Órdenes de Compra"
        sub="OC recibidas de clientes y trazabilidad documental"
      >
        <button
          className="btn btn-ghost"
          type="button"
          onClick={/* Ejecuta pdfInputRef.current?.click() al invocarse este callback. */ () => pdfInputRef.current?.click()}
        >
          <Ico p={I.upload} size={14} /> Subir OC en PDF
        </button>

        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handlePdfUpload}
          className="oc-hidden-input"
        />

        <button
          className="btn btn-primary"
          type="button"
          onClick={/* Ejecuta setShowInvoiceModal(true) al invocarse este callback. */ () => setShowInvoiceModal(true)}
        >
          <Ico p={I.invoice} size={14} /> Generar factura
        </button>
      </PageTitle>

      <div className="panel">
        <table className="dt w-full">
          <thead>
            <tr>
              <th>N° OC</th>
              <th>Cotización</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Factura</th>
              <th>Archivo OC</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {orders.map(/* Renderiza una orden con la información de su factura asociada. */ (order) => {
              const invoice = getInvoice(order)

              return (
                <tr key={order.idOc || order.id}>
                  <td className="oc-id">{order.id}</td>
                  <td>{order.cot || "—"}</td>
                  <td>{order.cliente}</td>
                  <td>{order.fecha}</td>

                  <td>
                    {invoice ? (
                      <Badge t="ok">{invoice.id}</Badge>
                    ) : (
                      <span style={{ color: "#94A3B8" }}>
                        Sin factura
                      </span>
                    )}
                  </td>

                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={/* Ejecuta setPreviewOrder(order) al invocarse este callback. */ () => setPreviewOrder(order)}
                    >
                      <Ico p={I.pdf} size={13} /> Vista previa
                    </button>
                  </td>

                  <td>
                    {order.cotizacionId != null && (
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={/* Ejecuta desasociarCotizacion(order) al invocarse este callback. */ () => desasociarCotizacion(order)}
                      >
                        Desasociar cotización
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            {orders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24 }}>
                  No hay órdenes de compra registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: Generar factura */}
      {showInvoiceModal && (
        <div
          className="modal-backdrop"
          onClick={/* Ejecuta setShowInvoiceModal(false) al invocarse este callback. */ () => setShowInvoiceModal(false)}
        >
          <div
            className="modal oc-modal"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="oc-modal-header">
              <div>
                <h2 className="oc-modal-title">Generar factura</h2>
                <p className="oc-modal-subtitle">
                  Selecciona una orden de compra sin factura.
                </p>
              </div>

              <button
                type="button"
                onClick={/* Ejecuta setShowInvoiceModal(false) al invocarse este callback. */ () => setShowInvoiceModal(false)}
                aria-label="Cerrar generación de factura"
                className="oc-modal-close"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>

            <div className="field">
              <label className="label">Orden de Compra *</label>

              <select
                className="select"
                value={selectedOrderId}
                onChange={/* Ejecuta setSelectedOrderId(event.target.value) al invocarse este callback. */ (event) =>
                  setSelectedOrderId(event.target.value)
                }
              >
                <option value="">Seleccionar OC…</option>

                {orders.map(/* Renderiza la opción de orden e identifica si ya tiene una factura asociada. */ (order) => {
                  const invoice = getInvoice(order)

                  return (
                    <option
                      key={order.idOc || order.id}
                      value={order.id}
                      disabled={Boolean(invoice)}
                    >
                      {order.id} · {order.cliente} · {fmtCLP(order.total)}
                      {invoice
                        ? ` · (Ya facturada: ${invoice.id})`
                        : ""}
                    </option>
                  )
                })}
              </select>

              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#64748B",
                  marginTop: 6,
                }}
              >
                Las OC con factura aparecen deshabilitadas.
              </p>
            </div>

            <div className="oc-form-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={!selectedOrderId}
                onClick={generateInvoice}
              >
                <Ico p={I.check} size={14} /> Emitir factura
              </button>

              <button
                className="btn btn-ghost"
                type="button"
                onClick={/* Ejecuta setShowInvoiceModal(false) al invocarse este callback. */ () => setShowInvoiceModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Vista previa de OC */}
      {previewOrder && (
        <div
          className="modal-backdrop"
          onClick={/* Ejecuta setPreviewOrder(null) al invocarse este callback. */ () => setPreviewOrder(null)}
        >
          <div
            className="modal oc-modal-wide"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="oc-modal-header">
              <div>
                <h2 className="oc-modal-title">
                  Orden de Compra {previewOrder.id}
                </h2>
                <p className="oc-modal-subtitle">
                  Detalle de la OC recibida del cliente
                </p>
              </div>

              <button
                type="button"
                onClick={/* Ejecuta setPreviewOrder(null) al invocarse este callback. */ () => setPreviewOrder(null)}
                aria-label="Cerrar vista previa"
                className="oc-modal-close"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                padding: "0 4px",
              }}
            >
              <div className="field">
                <label className="label">N° OC</label>
                <div className="input" style={{ background: "#F8FAFC" }}>
                  {previewOrder.id}
                </div>
              </div>

              <div className="field">
                <label className="label">Cotización asociada</label>
                <div className="input" style={{ background: "#F8FAFC" }}>
                  {previewOrder.cot || "—"}
                </div>
              </div>

              <div className="field">
                <label className="label">Cliente</label>
                <div className="input" style={{ background: "#F8FAFC" }}>
                  {previewOrder.cliente}
                </div>
              </div>

              <div className="field">
                <label className="label">Fecha</label>
                <div className="input" style={{ background: "#F8FAFC" }}>
                  {previewOrder.fecha}
                </div>
              </div>

              <div className="field">
                <label className="label">Total</label>
                <div
                  className="input"
                  style={{ background: "#F8FAFC", fontWeight: 700 }}
                >
                  {fmtCLP(previewOrder.total)}
                </div>
              </div>

              <div className="field">
                <label className="label">Factura asociada</label>
                <div className="input" style={{ background: "#F8FAFC" }}>
                  {getInvoice(previewOrder)?.id ?? "Sin factura"}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <h3
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  color: "#0F172A",
                  marginBottom: 10,
                }}
              >
                Detalle de productos
              </h3>

              <div
                style={{
                  padding: 16,
                  background: "#F8FAFC",
                  border: "1px dashed #CBD5E1",
                  borderRadius: 8,
                  fontSize: "0.8125rem",
                  color: "#64748B",
                  textAlign: "center",
                }}
              >
                Aún no hay detalle de líneas en esta OC.
                <br />
                (Se conectará al endpoint de detalle de orden de compra.)
              </div>
            </div>

            <div className="oc-form-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={/* Ejecuta setPreviewOrder(null) al invocarse este callback. */ () => setPreviewOrder(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Subir PDF */}
      {showUploadModal && (
        <div
          className="modal-backdrop"
          onClick={closeUploadModal}
        >
          <div
            className="modal oc-modal-wide"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="oc-modal-header">
              <div>
                <h2 className="oc-modal-title">
                  Importar Orden de Compra
                </h2>
                <p className="oc-modal-subtitle">
                  Datos detectados automáticamente. Revisa y edita antes de
                  guardar.
                </p>
              </div>

              <button
                type="button"
                onClick={closeUploadModal}
                aria-label="Cerrar importación"
                className="oc-modal-close"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>

            <div className="oc-upload-grid">
              <div className="oc-preview-box">
                <div className="oc-preview-header">
                  Vista previa del PDF
                </div>

                {pdfPreviewUrl ? (
                  <iframe
                    title="Vista previa de la orden de compra"
                    src={pdfPreviewUrl}
                    className="oc-preview-frame"
                  />
                ) : (
                  <div className="oc-preview-empty">
                    Sin archivo seleccionado
                  </div>
                )}

                <div className="oc-preview-note">
                  {uploadedPdf?.name}
                </div>
              </div>

              <div>
                <div className="oc-edit-form">
                  <div className="field">
                    <label className="label">N° Orden de Compra *</label>
                    <input
                      className="input"
                      value={detectedOrder.id}
                      onChange={/* Ejecuta setDetectedOrder({ ...detectedOrder, id: event.target.value, }) al invocarse este callback. */ (event) =>
                        setDetectedOrder({
                          ...detectedOrder,
                          id: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">Cotización</label>
                    <input
                      className="input"
                      value={detectedOrder.cot}
                      onChange={/* Ejecuta setDetectedOrder({ ...detectedOrder, cot: event.target.value, }) al invocarse este callback. */ (event) =>
                        setDetectedOrder({
                          ...detectedOrder,
                          cot: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">Cliente *</label>
                    <input
                      className="input"
                      value={detectedOrder.cliente}
                      onChange={/* Ejecuta setDetectedOrder({ ...detectedOrder, cliente: event.target.value, }) al invocarse este callback. */ (event) =>
                        setDetectedOrder({
                          ...detectedOrder,
                          cliente: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">Fecha</label>
                    <input
                      className="input"
                      type="date"
                      value={detectedOrder.fecha}
                      onChange={/* Ejecuta setDetectedOrder({ ...detectedOrder, fecha: event.target.value, }) al invocarse este callback. */ (event) =>
                        setDetectedOrder({
                          ...detectedOrder,
                          fecha: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">Total detectado (CLP)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={detectedOrder.total}
                      onChange={/* Ejecuta setDetectedOrder({ ...detectedOrder, total: event.target.value, }) al invocarse este callback. */ (event) =>
                        setDetectedOrder({
                          ...detectedOrder,
                          total: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">Factura asociada</label>
                    <select
                      className="select"
                      value={detectedOrder.factura}
                      onChange={/* Ejecuta setDetectedOrder({ ...detectedOrder, factura: event.target.value, }) al invocarse este callback. */ (event) =>
                        setDetectedOrder({
                          ...detectedOrder,
                          factura: event.target.value,
                        })
                      }
                    >
                      <option value="">Sin factura asociada</option>

                      {allInvoices.map(/* Renderiza el contenido de cada elemento de allInvoices. */ (invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.id} · {invoice.cliente} ·{" "}
                          {fmtCLP(invoice.total)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="oc-edit-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!detectedOrder.id || !detectedOrder.cliente}
                    onClick={saveUploadedOrder}
                  >
                    <Ico p={I.check} size={14} /> Guardar orden
                  </button>

                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={closeUploadModal}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
