// client/src/modules/Proveedores.tsx

import React, { useState } from "react"
import { Badge, I, Ico, PageTitle } from "../shared"

// ---------- Tipos exportables ----------
export type Proveedor = {
  id: number
  empresa: string
  pais: string
  contacto: string
  tel: string
  email: string
  direccion: string
  estado: "Activo" | "Inactivo"
}

export type ProveedorInput = {
  empresa: string
  pais: string
  contacto: string
  tel: string
  email: string
  direccion: string
  estado: "Activo" | "Inactivo"
}

// ---------- Props ----------
type Props = {
  proveedores: Proveedor[]
  loadError?: string
  onCreate: (input: ProveedorInput) => Promise<Proveedor>
  onUpdate: (proveedor: Proveedor, input: ProveedorInput) => Promise<Proveedor>
  onDelete: (proveedor: Proveedor) => Promise<void>
}

const EMPTY_FORM: ProveedorInput = {
  empresa: "",
  pais: "",
  contacto: "",
  tel: "",
  email: "",
  direccion: "",
  estado: "Activo",
}

// Muestra y filtra proveedores y gestiona sus formularios de creación, edición y eliminación.
export default function Proveedores({
  proveedores,
  loadError,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<ProveedorInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Cierra el formulario de proveedor y restablece la selección, los campos y el error.
  const closeModal = () => {
    setShowModal(false)
    setEditingProvider(null)
    setForm(EMPTY_FORM)
    setFormError("")
  }

  // Limpia la selección y el formulario y abre la creación de un proveedor.
  const openNew = () => {
    setEditingProvider(null)
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  // Carga el proveedor seleccionado en el formulario y abre su edición.
  const openEdit = (provider: Proveedor) => {
    setEditingProvider(provider)
    setForm({
      empresa: provider.empresa,
      pais: provider.pais,
      contacto: provider.contacto,
      tel: provider.tel,
      email: provider.email,
      direccion: provider.direccion,
      estado: provider.estado,
    })
    setFormError("")
    setShowModal(true)
  }

  const PHONE_REGEX = /^[\d\s+\-().]*$/

  // Valida los campos del proveedor y solicita su creación o actualización.
  const handleSave = async () => {
    // Validación mínima
    if (!form.empresa.trim() || !form.email.trim()) {
      setFormError("Nombre de empresa y email son obligatorios.")
      return
    }

    // 👇 Validar teléfono
    if (form.tel && !PHONE_REGEX.test(form.tel)) {
      setFormError("El teléfono solo puede contener números y los símbolos + - ( )")
      return
    }

    setSaving(true)
    setFormError("")
    try {
      if (editingProvider) {
        await onUpdate(editingProvider, form)
      } else {
        await onCreate(form)
      }
      closeModal()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo guardar el proveedor",
      )
    } finally {
      setSaving(false)
    }
  }

  // Pide confirmación y solicita eliminar el proveedor indicando qué registro se está eliminando.
  const handleDelete = async (provider: Proveedor) => {
    if (!confirm(`¿Eliminar a ${provider.empresa}?`)) return
    setDeletingId(provider.id)
    try {
      await onDelete(provider)
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo eliminar el proveedor")
    } finally {
      setDeletingId(null)
    }
  }

  // ---------- Filtro de búsqueda ----------
  const filtered = proveedores.filter(/* Filtra proveedores por el texto de búsqueda en empresa, país, contacto y correo. */ (provider) => {
    const query = search.toLowerCase()
    return (
      provider.empresa.toLowerCase().includes(query) ||
      provider.pais.toLowerCase().includes(query) ||
      provider.contacto.toLowerCase().includes(query)
    )
  })

  // ---------- Campos del formulario ----------
  // Actualiza únicamente el campo indicado del formulario de proveedor.
  const updateField = <K extends keyof ProveedorInput>(
    key: K,
    value: ProveedorInput[K],
  ) => setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, [key]: value }). */ (current) => ({ ...current, [key]: value }))

  return (
    <div>
      <PageTitle
        title="Proveedores"
        sub="Directorio de proveedores de materias primas"
      >
        <button className="btn btn-primary" onClick={openNew}>
          <Ico p={I.plus} size={14} /> Nuevo proveedor
        </button>
      </PageTitle>

      {loadError && (
        <div className="panel" style={{ marginBottom: 12, color: "#b91c1c" }}>
          {loadError}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div className="proveedores-search-wrap">
            <span className="proveedores-search-icon">
              <Ico p={I.search ?? I.clients} size={14} />
            </span>
            <input
              className="input proveedores-search-input"
              placeholder="Buscar por empresa, país o contacto…"
              value={search}
              onChange={/* Ejecuta setSearch(event.target.value) al invocarse este callback. */ (event) => setSearch(event.target.value)}
            />
          </div>
          <span className="proveedores-count">{filtered.length} proveedores</span>
        </div>
        <table className="dt w-full">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>País</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(/* Renderiza el contenido de cada elemento de filtered. */ (provider) => (
              <tr key={provider.id}>
                <td className="proveedores-name">{provider.empresa}</td>
                <td>
                  <Badge t="info">{provider.pais}</Badge>
                </td>
                <td>
                  <div>{provider.contacto}</div>
                  <div className="proveedores-phone">{provider.tel}</div>
                </td>
                <td className="proveedores-email">{provider.email}</td>
                <td>
                  <Badge t={provider.estado === "Activo" ? "ok" : "neutral"}>
                    {provider.estado}
                  </Badge>
                </td>
                <td>
                  <div className="proveedores-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Editar proveedor"
                      aria-label="Editar proveedor"
                      onClick={/* Ejecuta openEdit(provider) al invocarse este callback. */ () => openEdit(provider)}
                    >
                      <Ico p={I.edit} size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Eliminar proveedor"
                      aria-label="Eliminar proveedor"
                      onClick={/* Ejecuta handleDelete(provider) al invocarse este callback. */ () => handleDelete(provider)}
                      disabled={deletingId === provider.id}
                    >
                      <Ico p={I.trash} size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                  No hay proveedores que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div
            className="modal proveedores-modal"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
            key={editingProvider?.id ?? "new"}
          >
            <div className="proveedores-modal-header">
              <h2 className="proveedores-modal-title">
                {editingProvider ? "Editar Proveedor" : "Nuevo Proveedor"}
              </h2>
              <button onClick={closeModal} className="proveedores-modal-close">
                <Ico p={I.x} size={18} />
              </button>
            </div>

            {formError && (
              <div style={{ color: "#b91c1c", padding: "0 24px", marginBottom: 8 }}>
                {formError}
              </div>
            )}

            <div className="proveedores-form-grid">
              <div className="field proveedores-field-span-2">
                <label className="label">Nombre Empresa</label>
                <input
                  className="input"
                  placeholder="Nombre Empresa"
                  value={form.empresa}
                  onChange={/* Ejecuta updateField("empresa", e.target.value) al invocarse este callback. */ (e) => updateField("empresa", e.target.value)}
                />
              </div>

              <div className="field proveedores-field-span-1">
                <label className="label">País</label>
                <input
                  className="input"
                  placeholder="País"
                  value={form.pais}
                  onChange={/* Ejecuta updateField("pais", e.target.value) al invocarse este callback. */ (e) => updateField("pais", e.target.value)}
                />
              </div>

              <div className="field proveedores-field-span-1">
                <label className="label">Contacto</label>
                <input
                  className="input"
                  placeholder="Contacto"
                  value={form.contacto}
                  onChange={/* Ejecuta updateField("contacto", e.target.value) al invocarse este callback. */ (e) => updateField("contacto", e.target.value)}
                />
              </div>

              <div className="field proveedores-field-span-1">
                <label className="label">Teléfono</label>
                <input
                  className="input"
                  placeholder="Teléfono"
                  value={form.tel}
                  onChange={/* Ejecuta updateField("tel", e.target.value) al invocarse este callback. */ (e) => updateField("tel", e.target.value)}
                />
              </div>

              <div className="field proveedores-field-span-2">
                <label className="label">Email</label>
                <input
                  className="input"
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={/* Ejecuta updateField("email", e.target.value) al invocarse este callback. */ (e) => updateField("email", e.target.value)}
                />
              </div>

              <div className="field proveedores-field-span-2">
                <label className="label">Dirección proveedor</label>
                <input
                  className="input"
                  placeholder="Dirección proveedor"
                  value={form.direccion}
                  onChange={/* Ejecuta updateField("direccion", e.target.value) al invocarse este callback. */ (e) => updateField("direccion", e.target.value)}
                />
              </div>

              <div className="field proveedores-field-span-1">
                <label className="label">Estado</label>
                <select
                  className="input"
                  value={form.estado}
                  onChange={/* Ejecuta updateField("estado", e.target.value as "Activo" | "Inactivo") al invocarse este callback. */ (e) =>
                    updateField("estado", e.target.value as "Activo" | "Inactivo")
                  }
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            <div className="proveedores-form-actions">
              <button
                className="btn btn-primary proveedores-save"
                onClick={handleSave}
                disabled={saving}
              >
                <Ico p={I.check} size={14} />{" "}
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={closeModal}
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