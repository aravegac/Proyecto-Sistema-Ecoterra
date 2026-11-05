import React, { useState } from "react"
import { apiFetch } from "../api"
import { authHeaders, AuthUser, PageTitle, Product } from "../shared"

type Resultado = { estimacion: number; total?: number; mae_validacion: number; aviso: string }
const puertos = ["Corpus Christi, TX", "Miami, FL", "Los Angeles, CA"]
const navieras = ["MSC", "Maersk", "CMA CGM"]
const cargas = ["Exclusiva", "Consolidada"]
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
function fechaEnChile() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find(p => p.type === tipo)!.value
  return `${valor("year")}-${valor("month")}-${valor("day")}`
}
const dinero = (n: number) => n.toLocaleString("es-CL", { style: "currency", currency: "CLP" })

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
    <div className="panel-header">Predicción · {llegada ? "Tiempo de llegada" : "Precio esperado"}</div>
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

        </div>
      </>}
      <button type="submit" className="btn btn-primary ia-button">{ocupado ? "Calculando…" : "Calcular predicción"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite">{resultado && <div className={`ia-result ${llegada ? "ia-result-green" : "ia-result-blue"}`}>
        <div className="ia-result-main"><span className="ia-result-value">{llegada ? resultado.estimacion.toLocaleString("es-CL") : dinero(resultado.estimacion)}</span><span className="ia-result-unit">{llegada ? "días estimados" : "CLP por unidad"}</span></div>
        {resultado.total != null && <p>Total estimado: <strong>{dinero(resultado.total)}</strong></p>}
        <p>Error promedio del modelo: {llegada ? `${resultado.mae_validacion.toLocaleString("es-CL")} días` : dinero(resultado.mae_validacion)}.</p>

        <p className="ia-result-note">{resultado.aviso}</p>
      </div>}</div>
    </form>
  </div>
}

export default function IaPanel({ productos, usuario }: { productos: Product[]; usuario: AuthUser | null }) {
  return <div>
    <PageTitle title="Panel de Inteligencia Artificial" sub="Estimaciones de llegada y precio para apoyar la planificación" />
    <div className="ia-grid"><Modelo tipo="llegada" productos={productos} usuario={usuario} /><Modelo tipo="precio" productos={productos} usuario={usuario} /></div>
  </div>
}
