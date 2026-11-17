import React, { useState } from "react"
import { Badge, I, Ico, PageTitle, Product } from "../shared"

// Muestra controles y resultados de demostración para predicciones de llegada y precio de productos.
export default function IaPanel({ productos }: { productos: Product[] }) {
  // ── Estados para resultados de predicción ──────────────
  const [showArrivalResult, setShowArrivalResult] = useState(false)
  const [showPriceResult, setShowPriceResult] = useState(false)

  // ── Datos de ejemplo para las alertas de stockout ──────
  const stockAlerts = [
    {
      id: "POL-002",
      nombre: "EcoDust Control Supresor de Polvo 25L",
      estado: "Bajo mínimo",
      badgeT: "warn" as const,
      stock: 300,
      minimo: 1000,
      dias: 5,
    },
    {
      id: "POL-003",
      nombre: "EcoMine Heavy Duty 1000L",
      estado: "Sin stock",
      badgeT: "danger" as const,
      stock: 0,
      minimo: 2000,
      dias: 0,
    },
    {
      id: "POL-005",
      nombre: "EcoAgroPol Aplicación Agrícola 25L",
      estado: "Bajo mínimo",
      badgeT: "warn" as const,
      stock: 200,
      minimo: 800,
      dias: 7,
    },
  ]

  const totalAlertas = stockAlerts.length

  // ── Simulación de predicciones ─────────────────────────
  // Hace visible el resultado de demostración de la predicción de llegada.
  const handlePredictArrival = () => {
    setShowArrivalResult(true)
  }

  // Hace visible el resultado de demostración de la predicción de precio.
  const handlePredictPrice = () => {
    setShowPriceResult(true)
  }

  return (
    <div>
      <PageTitle
        title="Panel de Inteligencia Artificial"
        sub="Modelos predictivos entrenados con datos operativos de Ecoterra"
      />

      {/* ── Grid de Modelos Predictivos ─────────────────────── */}
      <div className="ia-grid">
        {/* Modelo 1: Tiempo de Llegada */}
        <div className="panel">
          <div className="panel-header">
            <span>
              <Ico p={I.ship} size={15} /> Predicción · Tiempo de Llegada
            </span>
            <Badge t="info">Modelo v2.1</Badge>
          </div>
          <div className="ia-card-body">
            <div className="ia-form-grid">
              <div className="field">
                <label className="label">Puerto de origen</label>
                <select className="select">
                  <option>Corpus Christi, TX</option>
                  <option>Miami, FL</option>
                  <option>Los Angeles, CA</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Naviera</label>
                <select className="select">
                  <option>MSC</option>
                  <option>Maersk</option>
                  <option>CMA CGM</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Tipo de carga</label>
                <select className="select">
                  <option>IBC 1000 L</option>
                  <option>Tambor 200 L</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Mes de embarque</label>
                <select className="select">
                  <option>Julio</option>
                  <option>Agosto</option>
                  <option>Septiembre</option>
                </select>
              </div>
            </div>
            <button
              className="btn btn-primary ia-button"
              onClick={handlePredictArrival}
            >
              <Ico p={I.sparkle} size={14} /> Calcular Predicción
            </button>

            {/* Resultado Tiempo de Llegada */}
            {showArrivalResult && (
              <div className="ia-result ia-result-green">
                <div className="ia-result-main">
                  <span className="ia-result-value">42</span>
                  <span className="ia-result-unit">días estimados</span>
                </div>
                <div className="ia-result-meta">
                  Confianza: <strong>93%</strong> · Rango: 39–47 días
                </div>
                <div className="ia-result-progress">
                  <div className="ia-result-progress-fill" style={{ width: "93%" }} />
                </div>
                <div className="ia-result-note">
                  → Emitir OC con al menos{" "}
                  <strong>47 días de anticipación</strong> para garantizar
                  continuidad.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modelo 2: Precio de Compra */}
        <div className="panel">
          <div className="panel-header">
            <span>
              <Ico p={I.bar} size={15} /> Predicción · Precio de Compra
            </span>
            <Badge t="info">Modelo v1.4</Badge>
          </div>
          <div className="ia-card-body">
            <div className="field">
              <label className="label">Producto</label>
              <select className="select">
                <option>Seleccionar producto…</option>
                {productos.map(/* Renderiza el contenido de cada elemento de productos. */ (product) => (
                  <option key={product.id}>
                    {product.codigo} · {product.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="ia-form-grid">
              <div className="field">
                <label className="label">Fecha estimada</label>
                <input
                  className="input"
                  type="date"
                  defaultValue="2024-09-01"
                />
              </div>
              <div className="field">
                <label className="label">Cantidad (unidades)</label>
                <input className="input" type="number" defaultValue="10" />
              </div>
            </div>
            <button
              className="btn btn-navy ia-button"
              onClick={handlePredictPrice}
            >
              <Ico p={I.sparkle} size={14} /> Predecir Precio
            </button>

            {/* Resultado Precio de Compra */}
            {showPriceResult ? (
              <div className="ia-result ia-result-blue">
                <div className="ia-result-main">
                  <span className="ia-result-value">$43.085</span>
                  <span className="ia-result-unit">/ unidad</span>
                </div>
                <div className="ia-result-meta">
                  Variación vs. precio actual:{" "}
                  <span className="ia-result-positive">+1,4%</span>
                </div>
                <div className="ia-result-note">
                  Total estimado (10 uds.): <strong>$430.858</strong>
                </div>
              </div>
            ) : (
              <div className="ia-empty-state">
                Selecciona producto y fecha para ver predicción.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Alertas de Stockout ─────────────────────────────── */}
      <div className="panel ia-alerts-panel">
        <div className="ia-alerts-header">
          <div className="ia-alerts-title">
            <Ico p={I.alert} size={16} />
            <span>Alertas de Stockout — Sistema Automatizado</span>
            <Badge t="danger">{totalAlertas} alertas</Badge>
          </div>
          <button className="btn btn-ghost">
            <Ico p={I.download} size={14} /> Generar Informe Predicción PDF
          </button>
        </div>

        <div className="ia-alerts-list">
          {stockAlerts.map(/* Renderiza el contenido de cada elemento de stockAlerts. */ (alert) => (
            <div key={alert.id} className="ia-alert-item">
              <div className="ia-alert-icon">
                <Ico p={I.alert} size={16} />
              </div>
              <div className="ia-alert-content">
                <div className="ia-alert-title-row">
                  <span className="ia-alert-name">{alert.nombre}</span>
                  <span className="ia-alert-code">{alert.id}</span>
                  <Badge t={alert.badgeT}>{alert.estado}</Badge>
                </div>
                <div className="ia-alert-meta">
                  Stock: {alert.stock} L / Mínimo: {alert.minimo} L
                </div>
                <div className="ia-alert-progress">
                  <div
                    className={`ia-alert-progress-fill ${alert.badgeT === "danger" ? "bg-danger" : "bg-warn"}`}
                    style={{
                      width: `${Math.min((alert.stock / alert.minimo) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="ia-alert-side">
                <div
                  className={`ia-alert-days ${alert.badgeT === "danger" ? "text-danger" : "text-warn"}`}
                >
                  {alert.dias}
                </div>
                <div className="ia-alert-days-label">días restantes</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}