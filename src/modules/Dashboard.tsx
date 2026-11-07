// client/src/modules/Dashboard.tsx
import React, { useEffect, useState } from "react"
import { apiFetch } from "../api"
import BrandLogo from "../BrandLogo"
import { authHeaders, AuthUser, Badge, can, fmt, I, Ico, Product, Screen } from "../shared"
import type { Invoice } from "./Facturacion"
import type { Movimiento } from "./Movimientos"

type CotizacionResumen = {
  id_cotizacion: number
  numero_cotizacion: string
  fecha_cotizacion: string
  cliente_nombre: string
}

const activityDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// Muestra los indicadores del panel y las alertas de productos con stock inferior al mínimo.
type PrediccionStock = {
  id_producto: number
  codigo_producto?: string
  nombre_producto?: string
  stock_actual: number | string
  stock_minimo: number | string | null
  prediccion_disponible: boolean
  requiere_reposicion: boolean | null
  dias_hasta_agotar_stock?: number | string | null
  mensaje: string
}

export default function Dashboard({
  authUser,
  productos,
  productosError,
  productosLoading,
  facturas,
  facturasLoading,
  facturasError,
  movimientos,
  movimientosLoading,
  movimientosError,
  predicciones,
  loadingPredicciones,
  errorPredicciones,
  onNav,
}: {
  authUser: AuthUser | null
  productos: Product[]
  productosError: string
  productosLoading: boolean
  facturas: Invoice[]
  facturasLoading: boolean
  facturasError: string
  movimientos: Movimiento[]
  movimientosLoading: boolean
  movimientosError: string
  predicciones: PrediccionStock[]
  loadingPredicciones: boolean
  errorPredicciones: string
  onNav: (screen: Screen) => void
}) {
  const canReadQuotes = can(authUser, "cotizaciones", "Consultar")
  const canReadInvoices = can(authUser, "facturacion", "Consultar")
  const canReadMovements = can(authUser, "movimientos", "Consultar")
  const canReadProducts = can(authUser, "productos", "Consultar")
  const canReadAlerts = can(authUser, "ia", "Predicción de reposición de stock")
  const [quotes, setQuotes] = useState<CotizacionResumen[]>([])
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [quotesError, setQuotesError] = useState("")

  useEffect(() => {
    if (!canReadQuotes) return
    const controller = new AbortController()
    setQuotesLoading(true)
    setQuotesError("")

    async function loadQuotes() {
      try {
        const response = await apiFetch("/api/cotizaciones/", {
          headers: authHeaders(authUser),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("No se pudieron cargar las cotizaciones.")
        const data = await response.json()
        const items = Array.isArray(data) ? data : data.value
        if (!Array.isArray(items)) throw new Error("Formato de cotizaciones inválido")
        if (!controller.signal.aborted) setQuotes(items)
      } catch {
        if (!controller.signal.aborted) {
          setQuotes([])
          setQuotesError("No se pudieron cargar las cotizaciones.")
        }
      } finally {
        if (!controller.signal.aborted) setQuotesLoading(false)
      }
    }

    void loadQuotes()
    return () => controller.abort()
  }, [authUser, canReadQuotes])

  const stockAlerts = predicciones.filter(product => {
    const stock = Number(product.stock_actual)
    const minimo = product.stock_minimo == null
      ? null
      : Number(product.stock_minimo)

    // Mostrar siempre los productos sin stock.
    if (stock <= 0) return true

    // Mostrar productos con stock igual o inferior al mínimo.
    return minimo != null && minimo > 0 && stock <= minimo
  })
  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const pendingInvoices = facturas.filter(invoice => invoice.estado.toUpperCase() === "PENDIENTE").length
  const activity = [
    ...(canReadQuotes && !quotesLoading && !quotesError ? quotes : []).map(quote => ({
      id: `quote-${quote.id_cotizacion}`,
      date: quote.fecha_cotizacion,
      desc: [`Cotización ${quote.numero_cotizacion}`, quote.cliente_nombre].filter(Boolean).join(" · "),
      icon: I.quotes,
      background: "#F1F5F9",
    })),
    ...(canReadInvoices && !facturasLoading && !facturasError ? facturas : []).map(invoice => ({
      id: `invoice-${invoice.id}`,
      date: invoice.fecha,
      desc: [`Factura ${invoice.id}`, invoice.cliente, invoice.estado].filter(Boolean).join(" · "),
      icon: I.invoice,
      background: "#DCFCE7",
    })),
    ...(canReadMovements && !movimientosLoading && !movimientosError ? movimientos : []).map(movimiento => ({
      id: `movement-${movimiento.id}`,
      date: movimiento.ts ? `${movimiento.ts.replace(" ", "T")}Z` : "",
      desc: `Movimiento de stock · ${movimiento.tipo} · ${movimiento.prod} · ${fmt(movimiento.qty)}`,
      icon: I.lots,
      background: "#F1F5F9",
    })),
  ]
    .map(item => ({ ...item, timestamp: Date.parse(item.date) }))
    .filter(item => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)

  const activityLoading = (canReadQuotes && quotesLoading) ||
    (canReadInvoices && facturasLoading) || (canReadMovements && movimientosLoading)
  const activityError = (canReadQuotes && quotesError) ||
    (canReadInvoices && facturasError) || (canReadMovements && movimientosError)

  return (
    <div className="dashboard-root">
      <div className="dashboard-hero">
        <div className="dashboard-hero-orb dashboard-hero-orb-top" />
        <div className="dashboard-hero-orb dashboard-hero-orb-bottom" />
        <div className="dashboard-hero-brand">
          <div className="dashboard-hero-logo">
            <BrandLogo />
          </div>
          <div>
            <div className="dashboard-hero-eyebrow">
              Sistema de Gestión Operativa
            </div>
            <div className="dashboard-hero-title">Panel de Control</div>
            <div className="dashboard-hero-date">
              {today}
            </div>
          </div>
        </div>
        <div className="dashboard-hero-kpis">
          {canReadAlerts && !loadingPredicciones && !errorPredicciones && stockAlerts.length > 0 && (
            <button
              className="dashboard-hero-kpi dashboard-hero-kpi-alert"
              onClick={/* Ejecuta onNav("ia") al invocarse este callback. */ () => onNav("ia")}
            >
              <span>Alertas stock</span>
              <strong>{stockAlerts.length}</strong>
            </button>
          )}
          {canReadQuotes && <button className="dashboard-hero-kpi" onClick={() => onNav("cotizaciones")}>
            <span>Cotizaciones</span>
            <strong>{quotesLoading ? "…" : quotesError ? "—" : quotes.length}</strong>
          </button>}
          {canReadInvoices && <button className="dashboard-hero-kpi" onClick={() => onNav("facturacion")}>
            <span>Fact. pendientes</span>
            <strong className="dashboard-hero-kpi-warn">{facturasLoading ? "…" : facturasError ? "—" : pendingInvoices}</strong>
          </button>}
        </div>
      </div>

      {/* ============ ALERTAS IA · STOCKOUT ============ */}
      {canReadAlerts && <div className="panel">
        <div className="panel-header">
          <div className="dashboard-section-title-row">
            <span className="dashboard-alert-icon">
              <Ico p={I.alert} size={15} />
            </span>
            <span className="dashboard-section-title">
              Alertas IA · Stockout
            </span>
            {!loadingPredicciones && !errorPredicciones && <Badge t="danger">{stockAlerts.length}</Badge>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={/* Ejecuta onNav("ia") al invocarse este callback. */ () => onNav("ia")}>
            Ver panel IA →
          </button>
        </div>
        {loadingPredicciones ? (
          <div className="ia-empty-state ia-info-stock" style={{ padding: 20 }}>
            Consultando alertas de stock...
          </div>
        ) : errorPredicciones ? (
          <div
            className="ia-empty-state ia-info-stock"
            style={{ padding: 20 }}
            role="alert"
          >
            <p style={{ color: "#dc2626" }}>
              {errorPredicciones}
            </p>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              No fue posible actualizar las alertas de stock.
            </span>
          </div>
        ) : stockAlerts.length === 0 ? (
          <div className="ia-empty-state ia-info-stock" style={{ padding: 20 }}>
            <Ico p={I.check} size={18} />

            <p style={{ marginTop: 8 }}>
              No hay productos que requieran reposición.
            </p>

            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Todos los productos tienen stock por encima de su mínimo establecido.
            </span>
          </div>
        ) : (
          stockAlerts.map(product => {
            const stock = Number(product.stock_actual) || 0

            const minimo = product.stock_minimo == null
              ? null
              : Number(product.stock_minimo)

            const productoLocal = productos.find(
              item => item.id === product.id_producto
            )

            const codigo =
              product.codigo_producto ||
              productoLocal?.codigo ||
              ""

            const nombre =
              product.nombre_producto ||
              productoLocal?.nombre ||
              `Producto ${product.id_producto}`

            const unidad = productoLocal?.unidad || ""

            const stockTotal = productoLocal?.stockTotal ?? stock

            const pct =
              minimo != null && minimo > 0
                ? Math.max(0, Math.min((stock / minimo) * 100, 100))
                : 0

            const agotado = stock <= 0

            return (
              <div
                key={product.id_producto}
                className="dashboard-alert-item"
              >
                <div className="dashboard-alert-content">
                  <div className="dashboard-alert-name">
                    {nombre}
                  </div>

                  <div className="dashboard-alert-meta">
                    {codigo} · Mínimo:{" "}
                    {minimo == null ? "No configurado" : `${fmt(minimo)} ${unidad}`}
                  </div>

                  {minimo != null && minimo > 0 && (
                    <div className="progress dashboard-stock-progress">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${pct}%`,
                          background: agotado ? "#DC2626" : "#D97706",
                        }}
                      />
                    </div>
                  )}

                  <div className="dashboard-alert-stock">
                    <span
                      className="tabular"
                      style={{
                        color: agotado ? "#DC2626" : "#B45309",
                        fontWeight: 700,
                      }}
                    >
                      {fmt(stock)} {unidad}
                    </span>

                    {" "}disponibles · {fmt(stockTotal)} {unidad} total
                  </div>
                </div>

                <div className="dashboard-alert-side">
                  <Badge t={agotado ? "danger" : "warn"}>
                    {agotado ? "Sin stock" : "Bajo mínimo"}
                  </Badge>
                </div>
              </div>
            )
          })
        )}
      </div>}

      {/* ============ STOCK ACTUAL POR PRODUCTO ============ */}
      {canReadProducts && <div className="panel">
        <div className="panel-header">
          <span className="dashboard-section-title">
            Stock actual por producto
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={/* Ejecuta onNav("productos") al invocarse este callback. */ () => onNav("productos")}
          >
            Ver catálogo →
          </button>
        </div>
        {productosLoading && <div className="dashboard-stock-item" role="status">Consultando stock…</div>}
        {!productosLoading && productosError && <div className="dashboard-stock-item" role="alert">{productosError}</div>}
        {!productosLoading && !productosError && productos.length === 0 && (
          <div className="dashboard-stock-item">No hay productos registrados.</div>
        )}
        {!productosLoading && !productosError && productos.map(/* Renderiza el indicador de stock del producto evitando dividir por un mínimo igual a cero. */ (product) => {
          const pct =
            product.stockMin === 0
              ? 100
              : Math.min(100, (product.stock / product.stockMin) * 100)
          const color =
            product.stock === 0 ? "#DC2626" : pct < 50 ? "#D97706" : "#00995A"
          return (
            <div key={product.id} className="dashboard-stock-item">
              <div className="dashboard-stock-content">
                <div className="dashboard-stock-name">{product.nombre}</div>
                <div className="progress" style={{ marginTop: 7 }}>
                  <div
                    className="progress-fill"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
              <div className="dashboard-stock-side">
                <div
                  className="tabular"
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color,
                  }}
                >
                  {fmt(product.stock)} {product.unidad}
                </div>
                <div className="dashboard-stock-meta">
                  mín. {fmt(product.stockMin)} {product.unidad} · {fmt(product.stockTotal)} {product.unidad} total
                </div>
              </div>
            </div>
          )
        })}
      </div>}

      {/* ============ ACTIVIDAD RECIENTE ============ */}
      {(canReadQuotes || canReadInvoices || canReadMovements) && <div className="panel">
        <div className="panel-header">
          <span className="dashboard-activity-title">Actividad reciente</span>
        </div>
        {activityLoading && <p className="dashboard-activity-item" role="status">Consultando actividad…</p>}
        {activityError && <p className="dashboard-activity-item" role="alert">No se pudieron cargar todos los registros de actividad.</p>}
        {!activityLoading && !activityError && activity.length === 0 && (
          <p className="dashboard-activity-item">No hay actividad registrada.</p>
        )}
        {activity.map((item, index) => (
          <div
            key={item.id}
            className="dashboard-activity-item"
            style={{
              borderBottom:
                index < activity.length - 1 ? "1px solid #F1F5F9" : "none",
            }}
          >
            <div
              className="dashboard-activity-icon"
              style={{ background: item.background }}
            >
              <Ico p={item.icon} size={13} />
            </div>
            <p className="dashboard-activity-desc">{item.desc}</p>
            <span className="dashboard-activity-time">{activityDate.format(item.timestamp)}</span>
          </div>
        ))}
      </div>}
    </div>
  )
}
