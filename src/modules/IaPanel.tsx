import React, { useState } from "react"
import { apiFetch } from "../api"
import { authHeaders, AuthUser, Badge, I, Ico, PageTitle, Product } from "../shared"

type Resultado = { estimacion: number; total?: number; mae_validacion: number; aviso: string; moneda?: "CLP" | "USD"; tipo_cambio?: number; version?: string }
const puertos = ["Corpus Christi, TX", "Miami, FL", "Los Angeles, CA"]
const navieras = ["MSC", "Maersk", "CMA CGM"]
const cargas = ["Exclusiva", "Consolidada"]
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
function fechaEnChile() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find(p => p.type === tipo)!.value
  return `${valor("year")}-${valor("month")}-${valor("day")}`
}
const dinero = (n: number, moneda: "CLP" | "USD" = "CLP") => n.toLocaleString("es-CL", { style: "currency", currency: moneda, minimumFractionDigits: moneda === "USD" ? 2 : 0, maximumFractionDigits: moneda === "USD" ? 2 : 0 })

function Modelo({ tipo, productos, usuario }: { tipo: "llegada" | "precio"; productos: Product[]; usuario: AuthUser | null }) {
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
    const entrada = llegada ? { ...valores, mes: Number(valores.mes), anio: Number(valores.anio) } : { ...valores, producto: Number(valores.producto), cantidad: Number(valores.cantidad) }
    setResultado(null); setError("")
    const fechaActual = fechaEnChile()
    if (llegada ? Number(valores.anio) < Number(fechaActual.slice(0, 4)) || (Number(valores.anio) === Number(fechaActual.slice(0, 4)) && Number(valores.mes) < Number(fechaActual.slice(5, 7))) : String(valores.fecha) < fechaActual) {
      setError(llegada ? "Selecciona el mes actual o uno futuro." : "La fecha debe ser hoy o una fecha futura.")
      return
    }
    setOcupado(true)
    try {
      const respuesta = await apiFetch(`/api/predicciones/${tipo}/`, { method: "POST", headers: authHeaders(usuario), body: JSON.stringify(entrada) })
      const datos = await respuesta.json()
      if (!respuesta.ok) throw new Error(datos.detail || Object.entries(datos).map(([campo, mensaje]) => `${campo}: ${mensaje}`).join(" · "))
      setResultado(datos)
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar la predicción.") }
    finally { setOcupado(false) }
  }
  return <div className="panel">
    <div className="panel-header">
      <span><Ico p={llegada ? I.ship : I.bar} size={15} /> Predicción · {llegada ? "Tiempo de llegada" : "Precio esperado"}</span>
      <Badge t="info">{resultado?.version ? `Modelo ${resultado.version}` : "Modelo predictivo"}</Badge>
    </div>
    <form className="ia-card-body" onSubmit={consultar} onChange={() => { setResultado(null); setError("") }}>
      <fieldset disabled={ocupado} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {llegada ? <div className="ia-form-grid">
        <label className="field"><span className="label">Puerto de origen</span><select name="puerto" className="select">{puertos.map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="field"><span className="label">Naviera</span><select name="naviera" className="select">{navieras.map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="field"><span className="label">Tipo de carga</span><select name="carga" className="select">{cargas.map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="field"><span className="label">Año de embarque</span><input required type="number" name="anio" min={anioActual} max="9999" step="1" value={anio} onChange={e => {
          const nuevoAnio = Number(e.target.value)
          setAnio(nuevoAnio)
          if (nuevoAnio === anioActual && mes < mesActual) setMes(mesActual)
        }} className="input" /></label>
        <label className="field"><span className="label">Mes de embarque</span><select name="mes" value={mes} onChange={e => setMes(Number(e.target.value))} className="select">{meses.map((v,i) => <option key={v} value={i+1} disabled={anio === anioActual && i+1 < mesActual}>{v}</option>)}</select></label>
      </div> : <>
        <label className="field"><span className="label">Producto</span><select required name="producto" defaultValue="" className="select"><option value="" disabled>Seleccionar producto…</option>{productos.filter(p => p.estado === "Activo").map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
        <div className="ia-form-grid">
          <label className="field"><span className="label">Fecha estimada</span><input required type="date" name="fecha" min={hoy} defaultValue={hoy} className="input" /></label>
          <label className="field"><span className="label">Cantidad (unidades del producto)</span><input required type="number" name="cantidad" min="1" max="100" step="1" defaultValue="10" className="input" /></label>
          <label className="field"><span className="label">Moneda</span><select name="moneda" value={moneda} onChange={e => setMoneda(e.target.value as "CLP" | "USD")} className="select"><option value="CLP">CLP</option><option value="USD">USD</option></select></label>
          {moneda === "USD" && <label className="field"><span className="label">Tipo de cambio (CLP por 1 USD)</span><input required type="number" name="tipo_cambio" min="0.0001" max="99999999.9999" step="0.0001" placeholder="Ingresa la tasa a utilizar" className="input" /></label>}
        </div>
      </>}
      <button type="submit" className={`btn ${llegada ? "btn-primary" : "btn-navy"} ia-button`}><Ico p={I.sparkle} size={14} /> {ocupado ? "Calculando…" : llegada ? "Calcular predicción" : "Predecir precio"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite">{resultado ? <div className={`ia-result ${llegada ? "ia-result-green" : "ia-result-blue"}`}>
        <div className="ia-result-main"><span className="ia-result-value">{llegada ? resultado.estimacion.toLocaleString("es-CL") : dinero(resultado.estimacion, resultado.moneda)}</span><span className="ia-result-unit">{llegada ? "días estimados" : `${resultado.moneda ?? "CLP"} por unidad`}</span></div>
        {resultado.total != null && <p>Total estimado: <strong>{dinero(resultado.total, resultado.moneda)}</strong></p>}
        <div className="ia-result-meta">{llegada ? "Confianza y rango: pendientes de validación." : "Variación vs. precio actual: no disponible."}</div>
        <p>Error promedio del modelo: {llegada ? `${resultado.mae_validacion.toLocaleString("es-CL")} días` : dinero(resultado.mae_validacion, resultado.moneda)}.</p>
        {resultado.tipo_cambio != null && <p className="ia-result-note">Conversión: 1 USD = {resultado.tipo_cambio.toLocaleString("es-CL")} CLP · Tasa ingresada por el usuario.</p>}
        <p className="ia-result-note">{resultado.aviso}</p>
      </div> : !llegada ? <div className="ia-empty-state">Selecciona producto y fecha para ver la predicción.</div> : null}</div>
    </form>
  </div>
}

function AlertasStock({ productos }: { productos: Product[] }) {
  const alertas = productos.filter(p => p.estado === "Activo" && (p.stock <= 0 || p.stock < p.stockMin))
  return <div className="panel ia-alerts-panel">
    <div className="ia-alerts-header">
      <div className="ia-alerts-title"><Ico p={I.alert} size={16} /><span>Alertas de Stockout</span><Badge t={alertas.length ? "danger" : "ok"}>{alertas.length} alertas</Badge></div>
      <button type="button" className="btn btn-ghost" disabled title="La generación del informe PDF está pendiente de integración." style={{ opacity: .6, cursor: "not-allowed" }}>
        <Ico p={I.download} size={14} /> Generar Informe Predicción PDF
      </button>
    </div>
    <p className="ia-result-note" style={{ padding: "0 20px 12px" }}>Informe PDF y proyección de días restantes pendientes de integración.</p>
    <div className="ia-alerts-list">
      {alertas.length === 0 && <div className="ia-empty-state">No hay alertas de stock entre los productos cargados.</div>}
      {alertas.map(producto => {
        const sinStock = producto.stock <= 0
        const porcentaje = producto.stockMin > 0 ? Math.max(0, Math.min(producto.stock / producto.stockMin * 100, 100)) : 0
        return <div key={producto.id} className="ia-alert-item">
          <div className="ia-alert-icon"><Ico p={I.alert} size={16} /></div>
          <div className="ia-alert-content">
            <div className="ia-alert-title-row"><span className="ia-alert-name">{producto.nombre}</span><span className="ia-alert-code">{producto.codigo}</span><Badge t={sinStock ? "danger" : "warn"}>{sinStock ? "Sin stock" : "Bajo mínimo"}</Badge></div>
            <div className="ia-alert-meta">Stock: {producto.stock.toLocaleString("es-CL")} {producto.unidad} / Mínimo: {producto.stockMin.toLocaleString("es-CL")} {producto.unidad}</div>
            <div className="ia-alert-progress"><div className={`ia-alert-progress-fill ${sinStock ? "bg-danger" : "bg-warn"}`} style={{ width: `${porcentaje}%` }} /></div>
          </div>
          <div className="ia-alert-side"><div className={`ia-alert-days ${sinStock ? "text-danger" : "text-warn"}`}>{sinStock ? "0" : "—"}</div><div className="ia-alert-days-label">{sinStock ? "días restantes" : "Días por calcular"}</div></div>
        </div>
      })}
    </div>
  </div>
}

export default function IaPanel({ productos, usuario }: { productos: Product[]; usuario: AuthUser | null }) {
  return <div>
    <PageTitle title="Panel de Inteligencia Artificial" sub="Estimaciones de llegada y precio para apoyar la planificación" />
    <div className="ia-grid"><Modelo tipo="llegada" productos={productos} usuario={usuario} /><Modelo tipo="precio" productos={productos} usuario={usuario} /></div>
    <AlertasStock productos={productos} />
  </div>
}
