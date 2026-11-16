// LocationFields.tsx
import React, { useEffect, useId, useState } from "react"
import { countries } from "./countries"

type CountryRegions = {
  name: string
  iso2: string
  states: { name: string; state_code: string }[]
}

type Location = { pais: string; region: string; ciudad: string }

let catalogRequest: Promise<CountryRegions[]> | undefined

async function requestData<T>(path: string, body?: Record<string, string>): Promise<T> {
  const response = await fetch(`https://countriesnow.space/api/v0.1/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error("No se pudo consultar el catálogo de ubicaciones.")
  const result = await response.json()
  if (result.error) throw new Error("No se pudo consultar el catálogo de ubicaciones.")
  return result.data
}

function loadCatalog() {
  catalogRequest ??= requestData<CountryRegions[]>("countries/states").catch((error) => {
    catalogRequest = undefined
    throw error
  })
  return catalogRequest
}

export default function LocationFields({
  value,
  onChange,
}: {
  value: Location
  onChange: (location: Location) => void
}) {
  const id = useId()
  const [catalog, setCatalog] = useState<CountryRegions[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const code = countries.find(({ name }) => name === value.pais)?.code
  const country = catalog.find(({ iso2 }) => iso2 === code)
  const regions = country?.states ?? []

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    setCities([])
    async function load() {
      try {
        const data = await loadCatalog()
        if (!active) return
        setCatalog(data)
        const selected = data.find(({ iso2 }) => iso2 === code)
        if (code && !selected) throw new Error("País sin cobertura en el catálogo.")
        if (!selected || (selected.states.length > 0 && !value.region)) return
        const list = await requestData<string[]>(
          selected.states.length > 0 ? "countries/state/cities" : "countries/cities",
          selected.states.length > 0
            ? { country: selected.name, state: value.region }
            : { country: selected.name },
        )
        if (active) setCities([...new Set(list)].sort((a, b) => a.localeCompare(b, "es")))
      } catch {
        if (active) setError("No se pudieron cargar las ubicaciones. Intenta nuevamente.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [code, value.region, retry])

  return <>
    <div className="field">
      <label className="label" htmlFor={id + "-country"}>País *</label>
      <select id={id + "-country"} className="select" value={value.pais} required={Boolean(value.pais) || !value.ciudad}
        onChange={(event) => onChange({ pais: event.target.value, region: "", ciudad: "" })}>
        <option value="">Seleccionar país…</option>
        {value.pais && !code && <option value={value.pais}>{value.pais}</option>}
        {countries.map(({ code, name, flag }) =>
          <option key={code} value={name}>{flag} {name}</option>)}
      </select>
    </div>
    <div className="field">
      <label className="label" htmlFor={id + "-region"}>Región</label>
      <select id={id + "-region"} className="select" value={value.region}
        required={regions.length > 0} disabled={!value.pais || loading || Boolean(error)}
        onChange={(event) => onChange({ ...value, region: event.target.value, ciudad: "" })}>
        <option value="">{loading ? "Cargando…" : country && !regions.length ? "Sin regiones en el catálogo" : "Seleccionar región…"}</option>
        {value.region && !regions.some(({ name }) => name === value.region) &&
          <option value={value.region}>{value.region}</option>}
        {regions.map(({ name, state_code }) => {
          // 👇 Limpiamos el sufijo "Region", "Province", "State", etc.
          const cleanName = name
            .replace(/\s+Region$/i, "")
            .replace(/\s+Province$/i, "")
            .replace(/\s+State$/i, "")
            .replace(/\s+Región$/i, "")
            .trim();
          return <option key={state_code} value={name}>{cleanName}</option>;
        })}
      </select>
    </div>
    <div className="field">
      <label className="label" htmlFor={id + "-city"}>Ciudad *</label>
      <select id={id + "-city"} className="select" value={value.ciudad} required
        disabled={!country || (regions.length > 0 && !value.region) || loading || Boolean(error)}
        onChange={(event) => onChange({ ...value, ciudad: event.target.value })}>
        <option value="">{loading ? "Cargando…" : "Seleccionar ciudad…"}</option>
        {value.ciudad && !cities.includes(value.ciudad) &&
          <option value={value.ciudad}>{value.ciudad}</option>}
        {cities.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      {!loading && country && (!regions.length || value.region) && !cities.length && !error &&
        <span className="label">No hay ciudades disponibles en el catálogo.</span>}
    </div>
    {error && <div role="alert">
      <p>{error}</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry(retry + 1)}>Reintentar</button>
    </div>}
  </>
}
