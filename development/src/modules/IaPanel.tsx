import React, { useState } from "react"
import { apiFetch } from "../api"
import { authHeaders, AuthUser, Badge, I, Ico, PageTitle, Product } from "../shared"

// ==================================================
// TIPOS
// ==================================================

type Resultado = {
  estimacion: number
  total?: number
  mae_validacion: number
  aviso: string
  moneda?: "CLP" | "USD"
  tipo_cambio?: number
  version?: string
}

type PrediccionStock = {
  id_producto: number
  codigo_producto?: string
  nombre_producto?: string

  // Compatibilidad por si el servicio entrega estos nombres.
  codigo?: string
  nombre?: string

  stock_actual: number | string
  stock_minimo: number | string | null
  ventas_promedio_90d: number | string | null
  dias_historial_disponible: number

  requiere_reposicion: boolean | null
  prediccion_disponible: boolean
  dias_hasta_agotar_stock?: number | string | null
  estado_reposicion?: string
  mensaje: string

  // Advertencias relacionadas con el modelo predictivo.
  advertencia_modelo?: boolean
  tipo_advertencia?: string | null
  variables_fuera_rango?: string[]
  variables_atipicas?: string[]
  mensaje_advertencia?: string | null

  unidad_producto?: string
}

// ==================================================
// CONSTANTES Y FUNCIONES AUXILIARES
// ==================================================
const puertos = ["Corpus Christi, TX", "Miami, FL", "Los Angeles, CA"]
const navieras = ["MSC", "Maersk", "CMA CGM"]
const cargas = ["Exclusiva", "Consolidada"]

const meses = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

function fechaEnChile() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const valor = (tipo: string) =>
    partes.find(p => p.type === tipo)!.value

  return `${valor("year")}-${valor("month")}-${valor("day")}`
}

const dinero = (
  n: number,
  moneda: "CLP" | "USD" = "CLP",
) =>
  n.toLocaleString("es-CL", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: moneda === "USD" ? 2 : 0,
    maximumFractionDigits: moneda === "USD" ? 2 : 0,
  })

// Convierte los valores numéricos que pueden llegar como string
// desde Django REST Framework.
function numero(valor: number | string | null | undefined): number {
  if (valor == null || valor === "") return 0

  const convertido = Number(valor)
  return Number.isFinite(convertido) ? convertido : 0
}

function formatoNumero(valor: number | string | null | undefined) {
  return numero(valor).toLocaleString("es-CL", {
    maximumFractionDigits: 2,
  })
}

function nombreVariableStock(variable: string): string {
  const nombres: Record<string, string> = {
    stock_actual: "Stock actual",
    stock_minimo: "Stock mínimo",
    ventas_promedio_90d: "Ventas promedio de 90 días",
    cobertura_stock_dias: "Cobertura de stock",
    desviacion_ventas_90d: "Variación de las ventas de 90 días",
    tendencia_ventas_90d_pct: "Tendencia de ventas de 90 días",
    ventas_maximas_90d: "Ventas máximas de 90 días",
    dias_con_ventas_90d: "Días con ventas registradas",
    ventas_promedio_30d: "Ventas promedio de 30 días",
    ventas_promedio_60d: "Ventas promedio de 60 días",
    variacion_30d_90d: "Variación de ventas entre períodos",
    dias_desde_ultima_venta: "Días desde la última venta",
    tendencia_ventas_30d_pct: "Tendencia de ventas de 30 días",
  }

  return nombres[variable] ?? variable
}

// ==================================================
// MODELOS DE PREDICCIÓN EXISTENTES
// ==================================================

function Modelo({
  tipo,
  productos,
  usuario,
}: {
  tipo: "llegada" | "precio"
  productos: Product[]
  usuario: AuthUser | null
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const llegada = tipo === "llegada"
  const hoy = fechaEnChile()
  const anioActual = Number(hoy.slice(0, 4))
  const mesActual = Number(hoy.slice(5, 7))

  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState(mesActual)
  const [moneda, setMoneda] = useState<"CLP" | "USD">("CLP")

  async function consultar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const valores = Object.fromEntries(new FormData(event.currentTarget))

    const entrada = llegada
      ? {
          ...valores,
          mes: Number(valores.mes),
          anio: Number(valores.anio),
        }
      : {
          ...valores,
          producto: Number(valores.producto),
          cantidad: Number(valores.cantidad),
        }

    setResultado(null)
    setError("")

    const fechaActual = fechaEnChile()

    if (
      llegada
        ? Number(valores.anio) < Number(fechaActual.slice(0, 4)) ||
          (
            Number(valores.anio) === Number(fechaActual.slice(0, 4)) &&
            Number(valores.mes) < Number(fechaActual.slice(5, 7))
          )
        : String(valores.fecha) < fechaActual
    ) {
      setError(
        llegada
          ? "Selecciona el mes actual o uno futuro."
          : "La fecha debe ser hoy o una fecha futura."
      )
      return
    }

    setOcupado(true)

    try {
      const respuesta = await apiFetch(`/api/predicciones/${tipo}/`, {
        method: "POST",
        headers: authHeaders(usuario),
        body: JSON.stringify(entrada),
      })

      const datos = await respuesta.json()

      if (!respuesta.ok) {
        throw new Error(
          datos.detail ||
          Object.entries(datos)
            .map(([campo, mensaje]) => `${campo}: ${mensaje}`)
            .join(" · ")
        )
      }

      setResultado(datos)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo consultar la predicción."
      )
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="ia-alerts-title">
          
          <Ico p={llegada ? I.ship : I.bar} size={15} />
          <span>Predicción · {llegada ? "Tiempo de llegada" : "Precio esperado"}</span>
          
        </div>

        <Badge t="info">
          {resultado?.version
            ? `Modelo predictivo Random Forest · ${resultado.version}`
            : "Modelo predictivo Random Forest"}
        </Badge>
      </div>

      <form
        className="ia-card-body"
        onSubmit={consultar}
        onChange={() => {
          setResultado(null)
          setError("")
        }}
      >
        <fieldset
          disabled={ocupado}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          {llegada ? (
            <div className="ia-form-grid">
              <label className="field">
                <span className="label">Puerto de origen</span>
                <select name="puerto" className="select">
                  {puertos.map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Naviera</span>
                <select name="naviera" className="select">
                  {navieras.map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Tipo de carga</span>
                <select name="carga" className="select">
                  {cargas.map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Año de embarque</span>
                <input
                  required
                  type="number"
                  name="anio"
                  min={anioActual}
                  max="9999"
                  step="1"
                  value={anio}
                  onChange={e => {
                    const nuevoAnio = Number(e.target.value)
                    setAnio(nuevoAnio)

                    if (nuevoAnio === anioActual && mes < mesActual) {
                      setMes(mesActual)
                    }
                  }}
                  className="input"
                />
              </label>

              <label className="field ia-field-full">
                <span className="label">Mes de embarque</span>
                <select
                  name="mes"
                  value={mes}
                  onChange={e => setMes(Number(e.target.value))}
                  className="select"
                >
                  {meses.map((v, i) => (
                    <option
                      key={v}
                      value={i + 1}
                      disabled={anio === anioActual && i + 1 < mesActual}
                    >
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="ia-form-grid">
              <label className="field ia-field-full">
                <span className="label">Producto</span>
                <select
                  required
                  name="producto"
                  defaultValue=""
                  className="select"
                >
                  <option value="" disabled>
                    Seleccionar producto…
                  </option>

                  {productos
                    .filter(p => p.estado === "Activo")
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} · {p.nombre}
                      </option>
                    ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Fecha estimada</span>
                <input
                  required
                  type="date"
                  name="fecha"
                  min={hoy}
                  defaultValue={hoy}
                  className="input"
                />
              </label>

              <label className="field">
                <span className="label">
                  Cantidad (unidades del producto)
                </span>
                <input
                  required
                  type="number"
                  name="cantidad"
                  min="1"
                  max="100"
                  step="1"
                  defaultValue="10"
                  className="input"
                />
              </label>

              <label className={moneda === "CLP" ? "field ia-field-full" : "field"}>
                <span className="label">Moneda</span>
                <select
                  name="moneda"
                  value={moneda}
                  onChange={e =>
                    setMoneda(e.target.value as "CLP" | "USD")
                  }
                  className="select"
                >
                  <option value="CLP">CLP</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              {moneda === "USD" && (
                <label className="field">
                  <span className="label">
                    Tipo de cambio (CLP por 1 USD)
                  </span>
                  <input
                    required
                    type="number"
                    name="tipo_cambio"
                    min="0.0001"
                    max="99999999.9999"
                    step="0.0001"
                    placeholder="Ingresa la tasa a utilizar"
                    className="input"
                  />
                </label>
              )}
            </div>
          )}

          <button
            type="submit"
            className={`btn ${llegada ? "btn-primary" : "btn-navy"} ia-button`}
          >
            <Ico p={I.sparkle} size={14} />
            {ocupado
              ? "Calculando…"
              : llegada
                ? "Calcular predicción"
                : "Predecir precio"}
          </button>
        </fieldset>

        {error && (
          <p role="alert" style={{ color: "#dc2626", marginTop: 12 }}>
            {error}
          </p>
        )}

        <div aria-live="polite">
          {resultado ? (
            <div
              className={`ia-result ${
                llegada ? "ia-result-green" : "ia-result-blue"
              }`}
            >
              <div className="ia-result-main">
                <span className="ia-result-value">
                  {llegada
                    ? resultado.estimacion.toLocaleString("es-CL")
                    : dinero(resultado.estimacion, resultado.moneda)}
                </span>

                <span className="ia-result-unit">
                  {llegada
                    ? "días estimados"
                    : `${resultado.moneda ?? "CLP"} por unidad`}
                </span>
              </div>

              {resultado.total != null && (
                <p>
                  Total estimado:{" "}
                  <strong>
                    {dinero(resultado.total, resultado.moneda)}
                  </strong>
                </p>
              )}

              <div className="ia-result-meta">
                {llegada
                  ? "Confianza y rango: pendientes de validación."
                  : "Variación vs. precio actual: no disponible."}
              </div>

              <p>
                Error promedio del modelo:{" "}
                {llegada
                  ? `${resultado.mae_validacion.toLocaleString("es-CL")} días`
                  : dinero(resultado.mae_validacion, resultado.moneda)}
                .
              </p>

              {resultado.tipo_cambio != null && (
                <p className="ia-result-note">
                  Conversión: 1 USD ={" "}
                  {resultado.tipo_cambio.toLocaleString("es-CL")} CLP ·
                  Tasa ingresada por el usuario.
                </p>
              )}

              <p className="ia-result-note">{resultado.aviso}</p>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  )
}

// ==================================================
// PREDICCIONES DE STOCK
// ==================================================

function PrediccionesStock({
  resultados,
  cargando,
  error,
  onRecargar,
}: {
  resultados: PrediccionStock[]
  cargando: boolean
  error: string
  onRecargar: () => void
}) {

  const recargar = () => {
    onRecargar()
  }

  const cantidadReposicion = resultados.filter(
    p => p.requiere_reposicion === true
  ).length

  const cantidadNoDisponibles = resultados.filter(
    p => !p.prediccion_disponible
  ).length

  const cantidadAdvertencias = resultados.filter(
    p => p.advertencia_modelo === true
  ).length

  return (
    <div className="panel ia-alerts-panel">
      <div className="ia-alerts-header">
        <div className="ia-alerts-title">
          <Ico p={I.alert} size={16} />

          <span>Predicción de Reposición de Stock</span>

          {!cargando && !error && (
            <>
              <Badge t={cantidadReposicion > 0 ? "danger" : "ok"}>
                {cantidadReposicion} por reponer
              </Badge>

              {cantidadAdvertencias > 0 && (
                <Badge t="info">
                  {cantidadAdvertencias} con advertencias del modelo
                </Badge>
              )}
            </>
          )}
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <Badge t="info">
            Modelo predictivo Random Forest
          </Badge>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={recargar}
            disabled={cargando}
            title="Actualizar predicciones"
          >
            <Ico p={I.bar} size={14} />
            {cargando ? "Consultando…" : "Actualizar"}
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: "#f8fafc",}}>
        <p
          className="ia-result-note"
          style={{ padding: "10px 20px", borderBottom: "1px solid #e2e8f0",}}
        >
          Estimación de días hasta agotar el stock, calculada mediante el
          modelo predictivo a partir del inventario disponible y las ventas
          promedio de los últimos 90 días.
        </p>
      </div>

      <div className="ia-alerts-list" aria-live="polite">
        {cargando && (
          <div className="ia-empty-state ia-info-stock">
            Consultando predicciones de stock…
          </div>
        )}

        {!cargando && error && (
          <div className="ia-empty-state ia-info-stock">
            <p role="alert" style={{ color: "#dc2626", marginBottom: 12 }}>
              {error}
            </p>

            <button
              type="button"
              className="btn btn-primary"
              onClick={recargar}
            >
              <Ico p={I.bar} size={14} />
              Reintentar consulta
            </button>
          </div>
        )}

        {!cargando && !error && resultados.length === 0 && (
          <div className="ia-empty-state ia-info-stock">
            No hay productos disponibles para generar predicciones de stock.
          </div>
        )}

        {!cargando && !error && resultados.map(producto => {
          const stock = numero(producto.stock_actual)
          // Identificar si el producto ya está agotado.
          const stockAgotado = stock <= 0

          const minimo = producto.stock_minimo == null
            ? null
            : numero(producto.stock_minimo)

          const ventas = numero(producto.ventas_promedio_90d)
          const dias = producto.dias_hasta_agotar_stock == null
            ? null
            : numero(producto.dias_hasta_agotar_stock)

          const codigo = producto.codigo_producto ?? producto.codigo ?? ""
          const nombre = producto.nombre_producto ?? producto.nombre ?? `Producto ${producto.id_producto}`
          const unidad = producto.unidad_producto ?? "L"

          const requiereReposicion =
            producto.prediccion_disponible &&
            producto.requiere_reposicion === true

          const prediccionNoDisponible = !producto.prediccion_disponible

          const tieneAdvertenciaModelo = producto.advertencia_modelo === true

          const variablesFueraRango = producto.variables_fuera_rango ?? []
          const variablesAtipicas = producto.variables_atipicas ?? []

          const tituloAdvertencia =
            producto.tipo_advertencia === "METADATOS_NO_DISPONIBLES"
              ? "No se pudieron verificar los rangos del modelo"
              : producto.tipo_advertencia === "FUERA_RANGO_ENTRENAMIENTO"
                ? "Datos fuera de los rangos de entrenamiento"
                : "Advertencia del modelo"

          const porcentaje =
            minimo != null && minimo > 0
              ? Math.max(0, Math.min((stock / minimo) * 100, 100))
              : 0

          const tipoBadge = prediccionNoDisponible
            ? "info"
            : requiereReposicion
              ? "danger"
              : "ok"

          const textoBadge = prediccionNoDisponible
            ? "Predicción no disponible"
            : stockAgotado
              ? "Stock agotado"
              : requiereReposicion
                ? "Reposición inmediata"
                : "Stock sobre el mínimo"

          return (
            <div key={producto.id_producto} className="ia-alert-item">
              <div
                className={`ia-alert-icon ${
                  prediccionNoDisponible
                    ? "ia-icon-info"
                    : requiereReposicion
                      ? "ia-icon-danger"
                      : "ia-icon-success"
                }`}
              >
                <Ico
                  p={
                    prediccionNoDisponible
                      ? I.bar
                      : requiereReposicion
                        ? I.alert
                        : I.check
                  }
                  size={16}
                />
              </div>

              <div className="ia-alert-content">
                <div className="ia-alert-title-row">
                  <span className="ia-alert-name">{nombre}</span>

                  <span className="ia-alert-code">{codigo}</span>

                  <Badge t={tipoBadge}>
                    {textoBadge}
                  </Badge>
                </div>

                <div className="ia-alert-meta">
                  Stock actual: {formatoNumero(stock)} {unidad}
                  {" · "}
                  Stock mínimo:{" "}
                  {minimo == null
                    ? "No configurado"
                    : `${formatoNumero(minimo)} ${unidad}`}
                </div>

                <div className="ia-alert-meta">
                  Ventas promedio (90 días): {formatoNumero(ventas)} {unidad}/día
                </div>

                {minimo != null && minimo > 0 && (
                  <div
                    className="ia-alert-progress"
                    title={`Stock equivalente al ${porcentaje.toFixed(1)}% del mínimo`}
                  >
                    <div
                      className={`ia-alert-progress-fill ${
                        prediccionNoDisponible
                          ? "bg-info"
                          : requiereReposicion
                            ? "bg-danger"
                            : "bg-success"
                      }`}
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                )}

                {/* Mensaje correspondiente al estado de la predicción */}
                <p
                  className="ia-result-note"
                  style={{ marginTop: 6 }}
                >
                  {producto.mensaje}
                </p>

                {/* Advertencia independiente del modelo predictivo */}
                {tieneAdvertenciaModelo && (
                  <div
                    role="note"
                    className="ia-result-note ia-model-warning"
                  >
                    {/* Información principal de la advertencia */}
                    <div className="ia-model-warning-header">
                      <strong>
                        ⚠️ {tituloAdvertencia}
                      </strong>

                      <p>
                        {producto.mensaje_advertencia ||
                          "La estimación debe interpretarse con precaución."}
                      </p>
                    </div>

                    {/* Detalles desplegables */}
                    {(variablesFueraRango.length > 0 ||
                      variablesAtipicas.length > 0) && (
                      <details className="ia-warning-details">

                        <summary>
                          <span>Ver detalles de la advertencia</span>
                          <Ico p={I.chevD} size={16} />
                        </summary>

                        <div className="ia-warning-details-content">

                          {variablesFueraRango.length > 0 && (
                            <div>
                              <strong>Variables fuera de rango:</strong>

                              <ul>
                                {variablesFueraRango.map(variable => (
                                  <li key={variable}>
                                    {nombreVariableStock(variable)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {variablesAtipicas.length > 0 && (
                            <div>
                              <strong>Variables con valores atípicos:</strong>

                              <ul>
                                {variablesAtipicas.map(variable => (
                                  <li key={variable}>
                                    {nombreVariableStock(variable)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>

              <div className="ia-alert-side">
                {producto.prediccion_disponible && dias != null ? (
                  <>
                    <div
                      className={`ia-alert-days ${
                        requiereReposicion ? "text-danger" : ""
                      }`}
                    >
                      {stockAgotado
                        ? "0"
                        : dias.toLocaleString("es-CL", {
                            maximumFractionDigits: 1,
                          })}
                    </div>

                    <div className="ia-alert-days-label">
                      {stockAgotado
                        ? "Stock agotado"
                        : "días hasta agotar"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ia-alert-days">—</div>

                    <div className="ia-alert-days-label">
                      Sin estimación
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!cargando && !error && resultados.length > 0 && (
        <div
          className="ia-result-note"
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <strong>Resumen:</strong>{" "}
          {resultados.length} productos consultados ·{" "}
          {cantidadReposicion} requieren reposición ·{" "}
          {cantidadNoDisponibles} sin predicción disponible.
          <br />
          Los días estimados corresponden al tiempo proyectado hasta agotar
          el stock, no al tiempo hasta alcanzar el stock mínimo.
        </div>
      )}
    </div>
  )
}

// ==================================================
// PANEL PRINCIPAL DE IA
// ==================================================

export default function IaPanel({
  productos,
  usuario,
  predicciones,
  loadingPredicciones,
  errorPredicciones,
  onRecargarPredicciones,
}: {
  productos: Product[]
  usuario: AuthUser | null
  predicciones: PrediccionStock[]
  loadingPredicciones: boolean
  errorPredicciones: string
  onRecargarPredicciones: () => void
}) {
  return (
    <div>
      <PageTitle
        title="Panel de Inteligencia Artificial"
        sub="Estimaciones de llegada, precio y reposición de stock para apoyar la planificación"
      />

      <div className="ia-grid">
        <Modelo
          tipo="llegada"
          productos={productos}
          usuario={usuario}
        />

        <Modelo
          tipo="precio"
          productos={productos}
          usuario={usuario}
        />
      </div>

      <PrediccionesStock
        resultados={predicciones}
        cargando={loadingPredicciones}
        error={errorPredicciones}
        onRecargar={onRecargarPredicciones}
      />
    </div>
  )
}
