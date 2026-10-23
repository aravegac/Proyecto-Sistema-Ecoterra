import React, { useState } from "react"
import { Badge, fmt, I, Ico, PageTitle, Product } from "../shared"
import { Lote } from "./Lotes"

export type Movimiento = {
  id: number
  ts: string
  tipo: string
  prod: string
  qty: number
  stockAnterior?: number | null
  stockPosterior?: number | null
  lote: string
  ref: string
  observacion: string
  user: string
}

export type MovimientoInput = {
  tipo: string
  id_inventario: number
  cantidad_movimiento: number
  referencia?: string
  observacion?: string
  id_usuario: number
}

type Props = {
  productos: Product[]
  lotes: Lote[]
  movimientos: Movimiento[]
  usuarioId: number
  loadError?: string
  onCreate: (input: MovimientoInput) => Promise<Movimiento>
}

export default function Movimientos({
  productos,
  lotes,
  movimientos,
  usuarioId,
  loadError,
  onCreate,
}: Props) {
  const [type, setType] = useState<"Entrada" | "Salida" | "Ajuste">("Entrada")
  const [prod, setProd] = useState("")
  const [loteId, setLoteId] = useState("")
  const [qty, setQty] = useState("")
  const [reference, setReference] = useState("")
  const [observation, setObservation] = useState("")
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const colors: Record<string, string> = {
    Entrada: "#00995A",
    Salida: "#DC2626",
    Ajuste: "#D97706",
  }

  const lotesDelProducto = lotes.filter((l) => l.prod === prod)
  const selectedLote = lotes.find((l) => String(l.id) === String(loteId))

  const registerMovement = async () => {
    if (!prod || !loteId || qty === "") {
      setError("Producto, lote y cantidad son obligatorios.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onCreate({
        tipo: type,
        id_inventario: Number(loteId),
        cantidad_movimiento: Number(qty),
        referencia: reference || undefined,
        observacion: observation || undefined,
        id_usuario: usuarioId,
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar movimiento")
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setDone(false)
    setProd("")
    setLoteId("")
    setQty("")
    setReference("")
    setObservation("")
    setError("")
  }

  return (
    <div>
      <PageTitle
        title="Movimientos de Stock"
        sub="Registro de entradas, salidas y ajustes"
      />

      {loadError && (
        <div className="panel" style={{ marginBottom: 12, color: "#b91c1c" }}>
          {loadError}
        </div>
      )}

      <div className="mov-grid">
        <div className="panel mov-card">
          <div className="mov-title">Registrar Movimiento</div>

          {done ? (
            <div className="mov-success-wrap">
              <Ico p={I.check} size={30} />
              <p className="mov-success-text">Movimiento registrado</p>
              <button
                className="btn btn-primary mov-success-button"
                onClick={resetForm}
              >
                Nuevo registro
              </button>
            </div>
          ) : (
            <>
              <div className="mov-toggle">
                {(["Entrada", "Salida", "Ajuste"] as const).map((value) => (
                  <button
                    key={value}
                    className={`mov-toggle-btn ${type === value ? "active" : ""}`}
                    style={{
                      background: type === value ? colors[value] : "transparent",
                      color: type === value ? "white" : "#94A3B8",
                    }}
                    onClick={() => {
                      setType(value)
                      setQty("")
                      setError("")
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>

              {error && (
                <div style={{ color: "#b91c1c", margin: "8px 0" }}>{error}</div>
              )}

              <div className="mov-form-stack">
                <div className="field">
                  <label className="label">Producto *</label>
                  <select
                    className="select"
                    value={prod}
                    onChange={(e) => {
                      setProd(e.target.value)
                      setLoteId("")
                    }}
                  >
                    <option value="">Seleccionar…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.codigo}>
                        {p.codigo} — {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Lote</label>
                  <select
                    className="select"
                    value={loteId}
                    disabled={!prod}
                    onChange={(e) => setLoteId(e.target.value)}
                  >
                    <option value="">Seleccionar lote…</option>
                    {lotesDelProducto.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id} · {l.ubic} · {fmt(l.qty)} L
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">
                    {type === "Ajuste"
                      ? "Stock final verificado (litros) *"
                      : "Cantidad (litros) *"}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={type === "Ajuste" ? 0 : 1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                  {selectedLote && (
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748B",
                        marginTop: 4,
                      }}
                    >
                      {type === "Ajuste" ? "Stock actual en el lote:" : "Stock final en el lote:"}{" "}
                      
                      <strong style={{ color: "#0F172A" }}>
                        {qty !== "" && type !== "Ajuste" 
                          ? fmt(
                              type === "Entrada" 
                                ? selectedLote.qty + Number(qty)
                                : selectedLote.qty - Number(qty)
                            )
                          : fmt(selectedLote.qty)
                        } L
                      </strong>

                      {qty !== "" && (
                        <span
                          style={{
                            marginLeft: 8,
                            color:
                              type === "Ajuste"
                                ? Number(qty) - selectedLote.qty === 0
                                  ? "#64748B"
                                  : Number(qty) > selectedLote.qty
                                    ? "#00995A"
                                    : "#DC2626"
                                : type === "Entrada"
                                  ? "#00995A"
                                  : "#DC2626",
                            fontWeight: 600,
                          }}
                        >
                          {type === "Ajuste" ? (
                            <>
                              ({Number(qty) > selectedLote.qty ? "+" : ""}
                              {fmt(Number(qty) - selectedLote.qty)} L)
                            </>
                          ) : type === "Entrada" ? (
                            <>
                              (+{fmt(Number(qty))} L)
                            </>
                          ) : (
                            <>
                              (-{fmt(Number(qty))} L)
                            </>
                          )}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label className="label">Referencia</label>
                  <input
                    className="input"
                    placeholder="Ej. OC-2024-040"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="label">Observación</label>
                  <textarea
                    className="input mov-observation"
                    placeholder={
                      type === "Ajuste"
                        ? "Motivo del ajuste (inventario físico, pérdida, daño...)"
                        : "Detalle adicional del movimiento"
                    }
                    rows={3}
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  disabled={saving || !prod || !loteId || qty === ""}
                  onClick={registerMovement}
                >
                  <Ico p={I.check} size={14} />{" "}
                  {saving ? "Registrando…" : `Confirmar ${type}`}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Historial */}
        <div className="panel">
          <div className="panel-header">Historial de Movimientos</div>
          <table className="dt mov-table" style={{ tableLayout: "auto" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha / Hora</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Stock</th>
                <th>Lote</th>
                <th>Referencia</th>
                <th>Observación</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((movement) => {
                const isAjuste = movement.tipo === "Ajuste"
                return (
                  <tr key={movement.id}>
                    <td>{movement.id}</td>
                    <td>{movement.ts}</td>
                    <td>
                      <Badge
                        t={
                          movement.tipo === "Entrada"
                            ? "ok"
                            : movement.tipo === "Salida"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {movement.tipo}
                      </Badge>
                    </td>
                    <td>{movement.prod}</td>
                    <td
                      className={
                        movement.tipo === "Salida"
                          ? "mov-history-qty-negative"
                          : "mov-history-qty-positive"
                      }
                    >
                      {movement.tipo === "Entrada" ? "+" : movement.tipo === "Salida" ? "-" : ""}
                      {fmt(movement.qty)} L
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {movement.stockAnterior != null &&
                      movement.stockPosterior != null ? (
                        <span>
                          <span style={{ color: "#64748B" }}>
                            {fmt(movement.stockAnterior)}
                          </span>
                          {" → "}
                          <strong
                            style={{
                              color:
                                movement.stockPosterior >
                                movement.stockAnterior
                                  ? "#00995A"
                                  : movement.stockPosterior <
                                      movement.stockAnterior
                                    ? "#DC2626"
                                    : "#64748B",
                            }}
                          >
                            {fmt(movement.stockPosterior)} L
                          </strong>
                        </span>
                      ) : (
                        <span style={{ color: "#94A3B8" }}>—</span>
                      )}
                    </td>
                    <td>{movement.lote}</td>
                    <td>{movement.ref}</td>
                    <td style={{ fontSize: "0.75rem", maxWidth: "250px", whiteSpace: "normal", wordBreak: "break-word" }}>
                      {movement.observacion || "—"}
                    </td>
                    <td>{movement.user}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}