// client/src/modules/Dashboard.tsx
import React from "react"
import BrandLogo from "../BrandLogo"
import { Badge, fmt, I, Ico, Product, Screen } from "../shared"

// Muestra los indicadores del panel y las alertas de productos con stock inferior al mínimo.
export default function Dashboard({
  productos,
  onNav,
}: {
  productos: Product[]
  onNav: (screen: Screen) => void
}) {
  const stockAlerts = productos.filter(product => {
  const stock = Number(product.stock)
  const minimo = Number(product.stockMin)

  // Mostrar siempre los productos sin stock.
  if (stock <= 0) return true

  // Si tiene stock, mostrarlo cuando alcance o esté bajo el mínimo.
  return minimo > 0 && stock <= minimo
})
  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const activity = [
    {
      time: "09:14",
      desc: "Cotización COT-2024-041 emitida — Minera Los Bronces S.A.",
      type: "quote",
    },
    {
      time: "07:30",
      desc: "Alerta IA: POL-002 cruzó umbral mínimo de stock. 300 L restantes.",
      type: "alert",
    },
    {
      time: "Ayer",
      desc: "Factura FAC-2024-122 emitida · $4.250.000 CLP · Vence 12 Jul.",
      type: "invoice",
    },
    {
      time: "Ayer",
      desc: "Lote LT-2024-005 registrado · 1.340 L POL-004 · Ubicación C3-02.",
      type: "lot",
    },
  ]

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
              Actualizado hace 4 min · {today}
            </div>
          </div>
        </div>
        <div className="dashboard-hero-kpis">
          {stockAlerts.length > 0 && (
            <button
              className="dashboard-hero-kpi dashboard-hero-kpi-alert"
              onClick={/* Ejecuta onNav("ia") al invocarse este callback. */ () => onNav("ia")}
            >
              <span>Alertas stock</span>
              <strong>{stockAlerts.length}</strong>
            </button>
          )}
          <div className="dashboard-hero-kpi">
            <span>Cotizaciones</span>
            <strong>6</strong>
          </div>
          <div className="dashboard-hero-kpi">
            <span>Fact. pendientes</span>
            <strong className="dashboard-hero-kpi-warn">3</strong>
          </div>
        </div>
      </div>

      {/* ============ ALERTAS IA · STOCKOUT ============ */}
      <div className="panel">
        <div className="panel-header">
          <div className="dashboard-section-title-row">
            <span className="dashboard-alert-icon">
              <Ico p={I.alert} size={15} />
            </span>
            <span className="dashboard-section-title">
              Alertas IA · Stockout
            </span>
            <Badge t="danger">{stockAlerts.length}</Badge>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={/* Ejecuta onNav("ia") al invocarse este callback. */ () => onNav("ia")}>
            Ver panel IA →
          </button>
        </div>
        {stockAlerts.length === 0 ? (
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
            const stock = Number(product.stock) || 0
            const minimo = Number(product.stockMin) || 0

            const pct =
              minimo > 0
                ? Math.max(0, Math.min((stock / minimo) * 100, 100))
                : 0

            const agotado = stock <= 0

            return (
              <div key={product.id} className="dashboard-alert-item">
                <div className="dashboard-alert-content">
                  <div className="dashboard-alert-name">
                    {product.nombre}
                  </div>

                  <div className="dashboard-alert-meta">
                    {product.codigo} · Mínimo: {fmt(minimo)} L
                  </div>

                  <div className="progress dashboard-stock-progress">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${pct}%`,
                        background: agotado ? "#DC2626" : "#D97706",
                      }}
                    />
                  </div>

                  <div className="dashboard-alert-stock">
                    <span
                      className="tabular"
                      style={{
                        color: agotado ? "#DC2626" : "#B45309",
                        fontWeight: 700,
                      }}
                    >
                      {fmt(stock)} L
                    </span>
                    {" "}disponibles · {fmt(product.stockTotal)} L total
                  </div>
                </div>

                <div className="dashboard-alert-side">
                  <Badge t={agotado ? "danger" : "warn"}>
                    {agotado ? "Sin stock" : "Bajo mínimo"}
                  </Badge>

                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onNav("ia")}
                    >
                      Consultar IA
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ============ STOCK ACTUAL POR PRODUCTO ============ */}
      <div className="panel">
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
        {productos.map(/* Renderiza el indicador de stock del producto evitando dividir por un mínimo igual a cero. */ (product) => {
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
                  {fmt(product.stock)} L
                </div>
                <div className="dashboard-stock-meta">
                  mín. {fmt(product.stockMin)} L · {fmt(product.stockTotal)} L total
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ============ ACTIVIDAD RECIENTE ============ */}
      <div className="panel">
        <div className="panel-header">
          <span className="dashboard-activity-title">Actividad reciente</span>
        </div>
        {activity.map(/* Renderiza el contenido de cada elemento de activity. */ (item, index) => (
          <div
            key={index}
            className="dashboard-activity-item"
            style={{
              borderBottom:
                index < activity.length - 1 ? "1px solid #F1F5F9" : "none",
            }}
          >
            <div
              className="dashboard-activity-icon"
              style={{
                background:
                  item.type === "alert"
                    ? "#FEE2E2"
                    : item.type === "invoice"
                      ? "#DCFCE7"
                      : "#F1F5F9",
              }}
            >
              <Ico
                p={
                  item.type === "alert"
                    ? I.alert
                    : item.type === "invoice"
                      ? I.invoice
                      : item.type === "quote"
                        ? I.quotes
                        : I.lots
                }
                size={13}
              />
            </div>
            <p className="dashboard-activity-desc">{item.desc}</p>
            <span className="dashboard-activity-time">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}