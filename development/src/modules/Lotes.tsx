// client/src/modules/Lotes.tsx
import React, { useState } from "react"
import { Badge, fmt, I, Ico, PageTitle, Product } from "../shared"

export type Lote = {
  id: number
  prod: string
  qty: number
  envase: string
  fabr: string
  venc: string
  ubic: string
  estado: string
}

export type LoteInput = {
  prod: string
  qty: number
  envase: string
  fabr: string
  venc: string
  ubic: string
  estado: string
}

type Props = {
  lotes: Lote[]
  productos: Product[]
  loadError?: string
  onCreate: (input: LoteInput) => Promise<Lote>
  onDelete: (lote: Lote) => Promise<void>
}

const EMPTY_FORM: LoteInput = {
  prod: "",
  qty: 0,
  envase: "",
  fabr: "",
  venc: "",
  ubic: "",
  estado: "Disponible",
}

// Muestra y filtra lotes y gestiona su creación, eliminación y alertas de vencimiento.
export default function Lotes({
  lotes,
  productos,
  loadError,
  onCreate,
  onDelete,
}: Props) {
  const [envase, setEnvase] = useState("")
  const [estado, setEstado] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<LoteInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const filtered = lotes.filter(
    /* Comprueba qué elementos cumplen la condición evaluando (!envase || lot.envase === envase) && (!estado || lot.estado === estado). */ (lot) =>
      (!envase || lot.envase === envase) && (!estado || lot.estado === estado),
  )

  const maxQty = Math.max(...lotes.map(/* Transforma cada elemento de la lista devolviendo lot.qty. */ (lot) => lot.qty), 1)

  // Indica si la fecha de vencimiento es futura y está a menos de 180 días.
  const expiringSoon = (date: string) => {
    const ms = new Date(date).getTime() - Date.now()
    return ms > 0 && ms < 1000 * 60 * 60 * 24 * 180
  }

  // Reinicia los campos y errores y abre el formulario de creación de lotes.
  const openNew = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  // Exige producto, cantidad y fechas, solicita la creación del lote y muestra los errores.
  const handleSave = async () => {
    if (!form.prod || !form.qty || !form.fabr || !form.venc) {
      setFormError("Producto, cantidad, fabricación y vencimiento son obligatorios.")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      await onCreate(form)
      setShowModal(false)
      setForm(EMPTY_FORM)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo guardar el lote",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Control de Lotes"
        sub="Trazabilidad de inventario físico por lote"
      >
        <button className="btn btn-primary" onClick={openNew}>
          <Ico p={I.plus} size={14} /> Registrar lote
        </button>
      </PageTitle>

      {loadError && (
        <div className="panel" style={{ marginBottom: 12, color: "#b91c1c" }}>
          {loadError}
        </div>
      )}

      <div className="lotes-kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Lotes activos</div>
          <div className="kpi-value tabular">
            {lotes.filter(/* Comprueba qué elementos cumplen la condición evaluando lot.qty > 0. */ (lot) => lot.qty > 0).length}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Litros en bodega</div>
          <div className="kpi-value tabular">
            {fmt(lotes.reduce(/* Acumula el resultado de la lista mediante sum + lot.qty. */ (sum, lot) => sum + lot.qty, 0))} L
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sin stock</div>
          <div className="kpi-value tabular lotes-danger-value">
            {lotes.filter(/* Comprueba qué elementos cumplen la condición evaluando lot.qty === 0. */ (lot) => lot.qty === 0).length}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Próx. a vencer</div>
          <div className="kpi-value tabular lotes-warn-value">
            {lotes.filter(/* Comprueba qué elementos cumplen la condición evaluando expiringSoon(lot.venc). */ (lot) => expiringSoon(lot.venc)).length}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="lotes-filter-row">
            <select
              className="select lotes-filter-a"
              value={envase}
              onChange={/* Ejecuta setEnvase(e.target.value) al invocarse este callback. */ (e) => setEnvase(e.target.value)}
            >
              <option value="">Todos los envases</option>
              <option>Tambor 200 L</option>
              <option>IBC 1000 L</option>
            </select>
            <select
              className="select lotes-filter-b"
              value={estado}
              onChange={/* Ejecuta setEstado(e.target.value) al invocarse este callback. */ (e) => setEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option>Disponible</option>
              <option>Reservado</option>
            </select>
          </div>
          <span className="lotes-count">{filtered.length} lotes</span>
        </div>
        <table className="dt w-full">
          <thead>
            <tr>
              <th>ID Lote</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Envase</th>
              <th>Fabricación</th>
              <th>Vencimiento</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(/* Renderiza el contenido de cada elemento de filtered. */ (lot) => (
              <tr key={lot.id}>
                <td className="lotes-id">{lot.id}</td>
                <td className="lotes-prod">{lot.prod}</td>
                <td
                  className={`lotes-qty ${lot.qty === 0 ? "lotes-qty-danger" : "lotes-qty-normal"}`}
                >
                  <div className="lotes-qty-stack">
                    <span>{fmt(lot.qty)} L</span>
                    <div className="progress lotes-progress">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(lot.qty / maxQty) * 100}%`,
                          background: lot.qty === 0 ? "#DC2626" : "#00995A",
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  <Badge t="neutral">{lot.envase}</Badge>
                </td>
                <td>{lot.fabr}</td>
                <td
                  className={expiringSoon(lot.venc) ? "lotes-venc-warn" : "lotes-venc"}
                >
                  {expiringSoon(lot.venc) && "⚠ "}
                  {lot.venc}
                </td>
                <td>
                  <code className="lotes-location">{lot.ubic}</code>
                </td>
                <td>
                  <Badge t={lot.estado === "Disponible" ? "ok" : "warn"}>
                    {lot.estado}
                  </Badge>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={/* Confirma la eliminación del lote, la solicita y muestra el error si falla. */ async () => {
                      if (!confirm(`¿Eliminar lote ${lot.id}?`)) return
                      try {
                        await onDelete(lot)
                      } catch (e) {
                        alert(e instanceof Error ? e.message : "Error al eliminar")
                      }
                    }}
                  >
                    <Ico p={I.trash} size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div
            className="modal lotes-modal"
            onClick={/* Ejecuta e.stopPropagation() al invocarse este callback. */ (e) => e.stopPropagation()}
          >
            <div className="lotes-modal-header">
              <h2 className="lotes-modal-title">Registrar lote</h2>
              <button
                onClick={/* Ejecuta setShowModal(false) al invocarse este callback. */ () => setShowModal(false)}
                aria-label="Cerrar"
                className="lotes-modal-close"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>

            {formError && (
              <div style={{ color: "#b91c1c", padding: "0 24px", marginBottom: 8 }}>
                {formError}
              </div>
            )}

            <div className="lotes-form-grid">
              <div className="field lotes-span-1">
                <label className="label">Producto *</label>
                <select
                  className="input"
                  value={form.prod}
                  onChange={/* Ejecuta setForm({ ...form, prod: e.target.value }) al invocarse este callback. */ (e) => setForm({ ...form, prod: e.target.value })}
                >
                  <option value="">Seleccionar…</option>
                  {productos.map(/* Renderiza el contenido de cada elemento de productos. */ (p) => (
                    <option key={p.id} value={p.codigo}>
                      {p.codigo} — {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field lotes-span-1">
                <label className="label">Cantidad *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.qty || ""}
                  onChange={/* Ejecuta setForm({ ...form, qty: Number(e.target.value) }) al invocarse este callback. */ (e) =>
                    setForm({ ...form, qty: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field lotes-span-1">
                <label className="label">Envase</label>
                <select
                  className="input"
                  value={form.envase}
                  onChange={/* Ejecuta setForm({ ...form, envase: e.target.value }) al invocarse este callback. */ (e) => setForm({ ...form, envase: e.target.value })}
                >
                  <option value="">Seleccionar…</option>
                  <option>Tambor 200 L</option>
                  <option>IBC 1000 L</option>
                </select>
              </div>
              <div className="field lotes-span-1">
                <label className="label">Fabricación *</label>
                <input
                  className="input"
                  type="date"
                  value={form.fabr}
                  onChange={/* Ejecuta setForm({ ...form, fabr: e.target.value }) al invocarse este callback. */ (e) => setForm({ ...form, fabr: e.target.value })}
                />
              </div>
              <div className="field lotes-span-1">
                <label className="label">Vencimiento *</label>
                <input
                  className="input"
                  type="date"
                  value={form.venc}
                  onChange={/* Ejecuta setForm({ ...form, venc: e.target.value }) al invocarse este callback. */ (e) => setForm({ ...form, venc: e.target.value })}
                />
              </div>
              <div className="field lotes-span-1">
                <label className="label">Ubicación</label>
                <input
                  className="input"
                  value={form.ubic}
                  onChange={/* Ejecuta setForm({ ...form, ubic: e.target.value }) al invocarse este callback. */ (e) => setForm({ ...form, ubic: e.target.value })}
                />
              </div>
              <div className="field lotes-span-1">
                <label className="label">Estado</label>
                <select
                  className="input"
                  value={form.estado}
                  onChange={/* Ejecuta setForm({ ...form, estado: e.target.value }) al invocarse este callback. */ (e) => setForm({ ...form, estado: e.target.value })}
                >
                  <option value="Disponible">Disponible</option>
                  <option value="Reservado">Reservado</option>
                </select>
              </div>
            </div>
            <div className="lotes-form-actions">
              <button
                className="btn btn-primary lotes-save"
                onClick={handleSave}
                disabled={saving}
              >
                <Ico p={I.check} size={14} /> {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={/* Ejecuta setShowModal(false) al invocarse este callback. */ () => setShowModal(false)}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}