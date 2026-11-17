// client/src/modules/Clientes.tsx
import React, { useState } from "react"
import { Badge, I, Ico, PageTitle } from "../shared"

export type Client = {
  id: number
  rut: string
  razon: string
  fantasia: string
  ciudad: string
  tel: string
  email: string
  rep: string
  estado: string
  dirs: {
    id: number
    nombre: string
    calle: string
    ciudad: string
    region: string
    pais: string
    codigo_postal: string | null
    tipo: string
    contacto_recepcion: string
    telefono_contacto: string
    instrucciones_entrega: string | null
    principal: boolean
  }[]
}

export type Address = Client["dirs"][number]

export type AddressInput = Omit<Address, "id">

export type NewClientInput = Omit<Client, "id" | "dirs"> & {
  razon_social: string
  nombre_fantasia: string
  telefono: string
  representante: string
}

const PHONE_REGEX = /^[\d\s+\-().]*$/

const emptyNewClient: NewClientInput = {
  rut: "",
  razon: "",
  fantasia: "",
  ciudad: "",
  tel: "",
  email: "",
  rep: "",
  estado: "Activo",
  razon_social: "",
  nombre_fantasia: "",
  telefono: "",
  representante: "",
}

const emptyAddress: AddressInput = {
  nombre: "",
  calle: "",
  ciudad: "",
  region: "",
  pais: "Chile",
  codigo_postal: "",
  tipo: "Despacho",
  contacto_recepcion: "",
  telefono_contacto: "",
  instrucciones_entrega: "",
  principal: false,
}

// Convierte los datos del cliente seleccionado a los campos del formulario de edición.
const clientToInput = (client: Client): NewClientInput => ({
  ...emptyNewClient,
  rut: client.rut,
  razon: client.razon,
  fantasia: client.fantasia,
  ciudad: client.ciudad,
  tel: client.tel,
  email: client.email,
  rep: client.rep,
  estado: client.estado,
  razon_social: client.razon,
  nombre_fantasia: client.fantasia,
  telefono: client.tel === "-" ? "" : client.tel,
  representante: client.rep === "-" ? "" : client.rep,
})

// Muestra y filtra clientes y gestiona sus formularios de creación, edición y direcciones.
export default function Clientes({
  clientes,
  loadError,
  onCreate,
  onDelete,
  onUpdate,
  onCreateAddress,
  onUpdateAddress,
  onDeleteAddress,
}: {
  clientes: Client[]
  loadError: string
  onCreate: (client: NewClientInput) => Promise<Client>
  onDelete: (client: Client) => Promise<void>
  onUpdate: (client: Client, input: NewClientInput) => Promise<Client>
  onCreateAddress: (client: Client, input: AddressInput) => Promise<Address>
  onUpdateAddress: (client: Client, address: Address, input: AddressInput) => Promise<Address>
  onDeleteAddress: (client: Client, address: Address) => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Client | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [newClient, setNewClient] = useState(emptyNewClient)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [editing, setEditing] = useState(false)
  const [editClient, setEditClient] = useState<NewClientInput>(emptyNewClient)
  const [editError, setEditError] = useState("")
  const [addressForm, setAddressForm] = useState<AddressInput>(emptyAddress)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addressError, setAddressError] = useState("")

  // Limpia los datos y errores y abre el formulario de creación de clientes.
  const openNewClient = () => {
    setNewClient(emptyNewClient)
    setSaveError("")
    setShowNew(true)
  }

  // Actualiza el campo indicado del formulario de nuevo cliente conservando los demás campos.
  const updateNewClient = (field: keyof NewClientInput, value: string) => {
    setNewClient(/* Calcula el nuevo valor de NewClient devolviendo ({ ...current, [field]: value }). */ (current) => ({ ...current, [field]: value }))
  }

  // Valida el teléfono, solicita la creación del cliente y muestra los errores de guardado.
  const saveNewClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (newClient.telefono && !PHONE_REGEX.test(newClient.telefono)) {
      setSaveError("El teléfono solo puede contener números y los símbolos + - ( )")
      return
    }

    setSaving(true)
    setSaveError("")

    try {
      await onCreate(newClient)
      setShowNew(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el cliente")
    } finally {
      setSaving(false)
    }
  }

  // Pide confirmación, elimina el cliente seleccionado y limpia su selección.
  const deleteSelectedClient = async () => {
    if (!selected || !window.confirm(`¿Eliminar a ${selected.razon}?`)) return

    setDeleteError("")
    try {
      await onDelete(selected)
      setSelected(null)
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "No se pudo eliminar el cliente",
      )
    }
  }

  // Carga el cliente seleccionado en el formulario y activa su modo de edición.
  const startEditing = () => {
    if (!selected) return
    setEditClient(clientToInput(selected))
    setEditError("")
    setEditing(true)
  }

  // Actualiza el campo indicado del formulario de edición del cliente.
  const updateEditClient = (field: keyof NewClientInput, value: string) => {
    setEditClient(/* Calcula el nuevo valor de EditClient devolviendo ({ ...current, [field]: value }). */ (current) => ({ ...current, [field]: value }))
  }

  // 👇 ÚNICA declaración de saveEditedClient
  // Valida el teléfono, guarda los cambios del cliente y actualiza su selección.
  const saveEditedClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return

    if (editClient.telefono && !PHONE_REGEX.test(editClient.telefono)) {
      setEditError("El teléfono solo puede contener números y los símbolos + - ( )")
      return
    }

    setSaving(true)
    setEditError("")
    try {
      const updated = await onUpdate(selected, editClient)
      setSelected(updated)
      setEditing(false)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "No se pudo actualizar el cliente")
    } finally {
      setSaving(false)
    }
  }

  // Carga una dirección existente o valores vacíos y abre el formulario de direcciones.
  const openAddressForm = (address?: Address) => {
    setEditingAddress(address ?? null)
    setAddressForm(
      address
        ? {
            nombre: address.nombre,
            calle: address.calle,
            ciudad: address.ciudad,
            region: address.region,
            pais: address.pais,
            codigo_postal: address.codigo_postal ?? "",
            tipo: address.tipo,
            contacto_recepcion: address.contacto_recepcion,
            telefono_contacto: address.telefono_contacto,
            instrucciones_entrega: address.instrucciones_entrega ?? "",
            principal: address.principal,
          }
        : { ...emptyAddress },
    )
    setShowAddressForm(true)
    setAddressError("")
  }

  // Crea o modifica la dirección del cliente y actualiza sus direcciones en la vista de detalle.
  const saveAddress = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return

    setSaving(true)
    setAddressError("")
    try {
      const saved = editingAddress
        ? await onUpdateAddress(selected, editingAddress, addressForm)
        : await onCreateAddress(selected, addressForm)
      setSelected(/* Añade o reemplaza la dirección guardada dentro del cliente seleccionado. */ (current) => {
        if (!current) return current
        const dirs = editingAddress
          ? current.dirs.map(/* Transforma cada elemento de la lista devolviendo (address.id === saved.id ? saved : address). */ (address) => (address.id === saved.id ? saved : address))
          : [...current.dirs, saved]
        return { ...current, dirs }
      })
      setEditingAddress(null)
      setAddressForm({ ...emptyAddress })
      setShowAddressForm(false)
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : "No se pudo guardar la dirección")
    } finally {
      setSaving(false)
    }
  }

  // Pide confirmación, elimina la dirección y actualiza el detalle del cliente seleccionado.
  const deleteAddress = async (address: Address) => {
    if (!selected || !window.confirm(`¿Eliminar la dirección ${address.nombre}?`)) return

    setAddressError("")
    try {
      await onDeleteAddress(selected, address)
      setSelected(/* Calcula el nuevo valor de Selected devolviendo current ? { ...current, dirs: current.dirs.filter((item) => item.id !== address.id) } : current. */ (current) =>
        current ? { ...current, dirs: current.dirs.filter(/* Comprueba qué elementos cumplen la condición evaluando item.id !== address.id. */ (item) => item.id !== address.id) } : current,
      )
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : "No se pudo eliminar la dirección")
    }
  }

  const filtered = clientes.filter(
    /* Comprueba qué elementos cumplen la condición evaluando client.razon.toLowerCase().includes(search.toLowerCase()) || client.rut.includes(search). */ (client) =>
      client.razon.toLowerCase().includes(search.toLowerCase()) ||
      client.rut.includes(search),
  )

  return (
    <div>
      <PageTitle
        title="Gestión de Clientes"
        sub="Clientes y sus múltiples direcciones de entrega"
      >
        <button className="btn btn-primary" onClick={openNewClient}>
          <Ico p={I.plus} size={14} /> Nuevo cliente
        </button>
      </PageTitle>
      {loadError && (
        <div className="panel" style={{ padding: 20, color: "#B91C1C" }}>
          {loadError}
        </div>
      )}
      <div className="panel">
        <div className="panel-header">
          <div className="clientes-search-wrap">
            <span className="clientes-search-icon">
              <Ico p={I.search ?? I.clients} size={14} />
            </span>
            <input
              className="input clientes-search-input"
              placeholder="Buscar por razón social o RUT…"
              value={search}
              onChange={/* Ejecuta setSearch(event.target.value) al invocarse este callback. */ (event) => setSearch(event.target.value)}
            />
          </div>
          <span className="clientes-count">{filtered.length} clientes</span>
        </div>
        <table className="dt w-full">
          <thead>
            <tr>
              <th>RUT</th>
              <th>Razón Social</th>
              <th>Ciudad</th>
              <th>Representante</th>
              <th>Teléfono</th>
              <th>Dirs.</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(/* Renderiza el contenido de cada elemento de filtered. */ (client) => (
              <tr
                key={client.id}
                onClick={/* Ejecuta setSelected(client) al invocarse este callback. */ () => setSelected(client)}
                className="clientes-row"
              >
                <td className="clientes-rut">{client.rut}</td>
                <td>
                  <div className="clientes-name">{client.razon}</div>
                  <div className="clientes-fantasia">{client.fantasia}</div>
                </td>
                <td>{client.ciudad}</td>
                <td>{client.rep}</td>
                <td>{client.tel}</td>
                <td>
                  <Badge t={client.dirs.length ? "info" : "neutral"}>
                    {client.dirs.length}
                  </Badge>
                </td>
                <td>
                  <Badge t={client.estado === "Activo" ? "ok" : "neutral"}>
                    {client.estado}
                  </Badge>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={/* Detiene la propagación del evento y selecciona el cliente de la fila. */ (event) => {
                      event.stopPropagation()
                      setSelected(client)
                    }}
                  >
                    Detalles <Ico p={I.chevR} size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="slideover-backdrop" onClick={/* Ejecuta setSelected(null) al invocarse este callback. */ () => setSelected(null)}>
          <div
            className="slideover"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="clientes-detail-header">
              <div className="clientes-detail-title-row">
                <div>
                  <span className="clientes-detail-rut">{selected.rut}</span>
                  <h2 className="clientes-detail-title">{selected.razon}</h2>
                  <p className="clientes-detail-subtitle">
                    {selected.fantasia} · {selected.ciudad}
                  </p>
                </div>
                <button onClick={/* Ejecuta setSelected(null) al invocarse este callback. */ () => setSelected(null)} className="clientes-detail-close">
                  <Ico p={I.x} size={18} />
                </button>
              </div>
            </div>
            {editing ? (
              <form className="clientes-detail-body" onSubmit={saveEditedClient}>
                {[
                  ["RUT", "rut"],
                  ["Razón Social", "razon_social"],
                  ["Nombre de Fantasía", "nombre_fantasia"],
                  ["Ciudad", "ciudad"],
                  ["Teléfono", "telefono"],
                  ["Correo Electrónico", "email"],
                  ["Representante", "representante"],
                ].map(/* Renderiza el contenido de cada elemento de [
                  ["RUT", "rut"],
                  ["Razón Social", "razon_social"],
                  ["Nombre de Fantasía", "nombre_fantasia"],
                  ["Ciudad", "ciudad"],
                  ["Teléfono", "telefono"],
                  ["Correo Electrónico", "email"],
                  ["Representante", "representante"],
                ]. */ ([label, field]) => (
                  <div className="field" key={label}>
                    <label className="label">{label}</label>
                    <input
                      className="input"
                      value={editClient[field as keyof NewClientInput]}
                      onChange={/* Ejecuta updateEditClient(field as keyof NewClientInput, event.target.value) al invocarse este callback. */ (event) =>
                        updateEditClient(field as keyof NewClientInput, event.target.value)
                      }
                      required={
                        field === "rut" ||
                        field === "razon_social" ||
                        field === "ciudad" ||
                        field === "telefono" ||
                        field === "email"
                      }
                      type={field === "email" ? "email" : "text"}
                    />
                  </div>
                ))}
                <div className="field">
                  <label className="label">Estado</label>
                  <select
                    className="input"
                    value={editClient.estado}
                    onChange={/* Ejecuta updateEditClient("estado", event.target.value) al invocarse este callback. */ (event) => updateEditClient("estado", event.target.value)}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
                {editError && <p style={{ color: "#B91C1C" }}>{editError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    <Ico p={I.check} size={14} /> Guardar cambios
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={/* Ejecuta setEditing(false) al invocarse este callback. */ () => setEditing(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="clientes-detail-body">
                {[
                  { label: "Estado", value: selected.estado },
                  { label: "Teléfono", value: selected.tel },
                  { label: "Correo Electrónico", value: selected.email },
                  { label: "Representante", value: selected.rep },
                ].map(/* Renderiza el contenido de cada elemento de [
                  { label: "Estado", value: selected.estado },
                  { label: "Teléfono", value: selected.tel },
                  { label: "Correo Electrónico", value: selected.email },
                  { label: "Representante", value: selected.rep },
                ]. */ (field) => (
                  <div className="field" key={field.label}>
                    <label className="label">{field.label}</label>
                    <input className="input" value={field.value} readOnly />
                  </div>
                ))}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="label">Direcciones ({selected.dirs.length})</label>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={/* Ejecuta openAddressForm() al invocarse este callback. */ () => openAddressForm()}>
                      <Ico p={I.plus} size={12} /> Agregar
                    </button>
                  </div>
                  {selected.dirs.map(/* Renderiza el contenido de cada elemento de selected.dirs. */ (address) => (
                    <div key={address.id} className="clientes-address" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>
                        {address.nombre} · {address.ciudad}{" "}
                        <Badge t={address.principal ? "ok" : "neutral"}>{address.tipo}</Badge>
                      </span>
                      <span style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={/* Ejecuta openAddressForm(address) al invocarse este callback. */ () => openAddressForm(address)} title="Editar dirección" aria-label={`Editar ${address.nombre}`}>
                          <Ico p={I.edit} size={12} />
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={/* Ejecuta deleteAddress(address) al invocarse este callback. */ () => deleteAddress(address)} title="Eliminar dirección" aria-label={`Eliminar ${address.nombre}`}>
                          <Ico p={I.trash} size={12} />
                        </button>
                      </span>
                    </div>
                  ))}
                  {addressError && <p style={{ color: "#B91C1C", marginTop: 12 }}>{addressError}</p>}
                  {showAddressForm && (
                    <form onSubmit={saveAddress} style={{ marginTop: 12, padding: 12, border: "1px solid #E2E8F0" }}>
                      <div className="field">
                        <label className="label">Nombre de dirección</label>
                        <input className="input" value={addressForm.nombre} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, nombre: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, nombre: event.target.value }). */ (current) => ({ ...current, nombre: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">Calle</label>
                        <input className="input" value={addressForm.calle} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, calle: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, calle: event.target.value }). */ (current) => ({ ...current, calle: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">Ciudad</label>
                        <input className="input" value={addressForm.ciudad} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, ciudad: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, ciudad: event.target.value }). */ (current) => ({ ...current, ciudad: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">Región</label>
                        <input className="input" value={addressForm.region} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, region: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, region: event.target.value }). */ (current) => ({ ...current, region: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">País</label>
                        <input className="input" value={addressForm.pais} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, pais: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, pais: event.target.value }). */ (current) => ({ ...current, pais: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">Código postal</label>
                        <input className="input" value={addressForm.codigo_postal ?? ""} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, codigo_postal: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, codigo_postal: event.target.value }). */ (current) => ({ ...current, codigo_postal: event.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="label">Tipo</label>
                        <select className="input" value={addressForm.tipo} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, tipo: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, tipo: event.target.value }). */ (current) => ({ ...current, tipo: event.target.value }))}>
                          <option value="Despacho">Despacho</option>
                          <option value="Facturación">Facturación</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">Contacto de recepción</label>
                        <input className="input" value={addressForm.contacto_recepcion} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, contacto_recepcion: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, contacto_recepcion: event.target.value }). */ (current) => ({ ...current, contacto_recepcion: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">Teléfono de contacto</label>
                        <input className="input" value={addressForm.telefono_contacto} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, telefono_contacto: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, telefono_contacto: event.target.value }). */ (current) => ({ ...current, telefono_contacto: event.target.value }))} required />
                      </div>
                      <div className="field">
                        <label className="label">Instrucciones de entrega</label>
                        <textarea className="input" value={addressForm.instrucciones_entrega ?? ""} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, instrucciones_entrega: event.target.value })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, instrucciones_entrega: event.target.value }). */ (current) => ({ ...current, instrucciones_entrega: event.target.value }))} />
                      </div>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                        <input type="checkbox" checked={addressForm.principal} onChange={/* Ejecuta setAddressForm((current) => ({ ...current, principal: event.target.checked })) al invocarse este callback. */ (event) => setAddressForm(/* Calcula el nuevo valor de AddressForm devolviendo ({ ...current, principal: event.target.checked }). */ (current) => ({ ...current, principal: event.target.checked }))} />
                        Dirección principal
                      </label>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn btn-primary btn-sm" type="submit" disabled={saving}><Ico p={I.check} size={12} /> Guardar dirección</button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={/* Cancela la edición de dirección, restablece sus campos y cierra el formulario. */ () => { setEditingAddress(null); setAddressForm({ ...emptyAddress }); setShowAddressForm(false) }}>Cancelar</button>
                      </div>
                    </form>
                  )}
                </div>
                {deleteError && <p style={{ color: "#B91C1C", marginTop: 12 }}>{deleteError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button className="btn btn-primary" type="button" onClick={startEditing}>
                    <Ico p={I.edit} size={14} /> Editar cliente
                  </button>
                  <button className="btn btn-danger" type="button" onClick={deleteSelectedClient}>
                    <Ico p={I.trash} size={14} /> Eliminar cliente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showNew && (
        <div className="modal-backdrop">
          <form
            className="modal"
            style={{ width: 540, padding: 24 }}
            onSubmit={saveNewClient}
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <h2 style={{ fontWeight: 700, color: "#0F172A", marginBottom: 18 }}>
              Nuevo Cliente
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                ["RUT", "rut"],
                ["Razón Social", "razon_social"],
                ["Nombre de Fantasía", "nombre_fantasia"],
                ["Ciudad", "ciudad"],
                ["Teléfono", "telefono"],
                ["Correo Electrónico", "email"],
                ["Representante", "representante"],
              ].map(/* Renderiza el contenido de cada elemento de [
                ["RUT", "rut"],
                ["Razón Social", "razon_social"],
                ["Nombre de Fantasía", "nombre_fantasia"],
                ["Ciudad", "ciudad"],
                ["Teléfono", "telefono"],
                ["Correo Electrónico", "email"],
                ["Representante", "representante"],
              ]. */ ([label, field]) => (
                <div className="field" key={label}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    placeholder={label}
                    value={newClient[field as keyof NewClientInput]}
                    onChange={/* Ejecuta updateNewClient(field as keyof NewClientInput, event.target.value) al invocarse este callback. */ (event) =>
                      updateNewClient(field as keyof NewClientInput, event.target.value)
                    }
                    required={field === "rut" || field === "razon_social" || field === "ciudad"}
                    type={field === "email" ? "email" : "text"}
                  />
                </div>
              ))}
              <div className="field">
                <label className="label">Estado</label>
                <select
                  className="input"
                  value={newClient.estado}
                  onChange={/* Ejecuta updateNewClient("estado", event.target.value) al invocarse este callback. */ (event) => updateNewClient("estado", event.target.value)}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>
            {saveError && <p style={{ color: "#B91C1C", marginTop: 12 }}>{saveError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <Ico p={I.check} size={14} /> Guardar
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={/* Ejecuta setShowNew(false) al invocarse este callback. */ () => setShowNew(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}