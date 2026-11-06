import { apiFetch } from "../api"
// usuarios.tsx
import React, { useEffect, useMemo, useState, useRef } from "react"
import { Badge, AuthUser, I, Ico, PageTitle, authHeaders } from "../shared"

export type User = {
  id: number
  nombre: string
  email: string
  rol: string
  id_rol?: number
  estado: string
  permisos?: Record<string, boolean>
  permisos_efectivos?: Record<string, boolean>
}

export type UserInput = {
  nombre: string
  email: string
  rol: string
  estado: string
  permisos?: Record<string, boolean>
  contrasena?: string
}

type PermisoCatalogo = {
  id: number
  nombre: string
  modulo: string
  descripcion: string
}

const ROLE_DISPLAY: Record<number, string> = {
  1: "Superusuario / Admin",
  2: "Usuario con privilegios",
  3: "Usuario base",
}

const NOMBRES_MODULO: Record<string, string> = {
  clientes: "Clientes",
  direcciones: "Direcciones",
  proveedores: "Proveedores",
  productos: "Productos",
  lotes: "Inventario / Lotes",
  movimientos: "Movimientos de stock",
  cotizaciones: "Cotizaciones",
  ordenes_compra: "Órdenes de compra",
  facturacion: "Facturación",
  notas_credito: "Notas de crédito",
  ia: "Inteligencia Artificial",
  usuarios_roles: "Usuarios y roles",
}

export default function Usuarios({
  usuarios,
  loadError,
  onCreate,
  onDelete,
  onUpdate,
  onPermissionsSaved,
  authUser,
}: {
  usuarios: User[]
  loadError: string
  onCreate: (input: UserInput) => Promise<User>
  onDelete: (user: User) => Promise<void>
  onUpdate: (user: User, input: UserInput) => Promise<User>
  onPermissionsSaved: (user: User) => void
  authUser: AuthUser | null
}) {
  const isAdmin = authUser?.id_rol === 1

  const [showNew, setShowNew] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState<number>(1)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const [showEdit, setShowEdit] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({
    nombre: "",
    email: "",
    rol: "",
    estado: "",
    password: "",
  })

  const [newUser, setNewUser] = useState<UserInput>({
    nombre: "",
    email: "",
    rol: "Usuario base",
    estado: "Activo",
  })

  const [catalogo, setCatalogo] = useState<PermisoCatalogo[]>([])
  const [rolPermisoIds, setRolPermisoIds] = useState<Set<number>>(new Set())
  const [permisoIdsOriginales, setPermisoIdsOriginales] = useState<Set<number>>(new Set())

  const [editPermissionsUser, setEditPermissionsUser] = useState<User | null>(null)
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [permissionsError, setPermissionsError] = useState("")
  const [reloadPermissions, setReloadPermissions] = useState(0)
  const [originalRoleId, setOriginalRoleId] = useState(1)
  const permissionsPanel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAdmin || !authUser) return
    const controller = new AbortController()
    setPermissionsLoading(true)
    setPermissionsError("")
    setSaveError("")
    const load = async () => {
      const read = async (url: string) => {
        const response = await apiFetch(url, { headers: authHeaders(authUser), signal: controller.signal })
        if (!response.ok) throw new Error("No se pudieron cargar los permisos. Intenta nuevamente.")
        return response.json()
      }
      const [items, target] = await Promise.all([
        read("/api/permisos/"),
        editPermissionsUser ? read(`/api/usuarios/${editPermissionsUser.id}/permisos/`) : Promise.resolve(null),
      ])
      if (!Array.isArray(items)) throw new Error("El catálogo de permisos no es válido.")
      let ids: Set<number>
      if (target && selectedRoleId === target.id_rol) {
        ids = new Set<number>(items.filter((p: PermisoCatalogo) => target.permisos_efectivos?.[`${p.modulo}:${p.nombre}`] === true).map((p: PermisoCatalogo) => p.id))
      } else {
        const role = await read(`/api/roles/${selectedRoleId}/permisos/`)
        ids = new Set<number>((role.permisos ?? []).map((p: PermisoCatalogo) => p.id))
      }
      if (controller.signal.aborted) return
      setCatalogo(items)
      setRolPermisoIds(ids)
      setPermisoIdsOriginales(new Set(ids))
      setOriginalRoleId(target?.id_rol ?? selectedRoleId)
      setPermissionsLoading(false)
    }
    load().catch((error) => {
      if (controller.signal.aborted) return
      setPermissionsError(error instanceof Error ? error.message : "No se pudieron cargar los permisos")
      setPermissionsLoading(false)
    })
    return () => controller.abort()
  }, [isAdmin, authUser, selectedRoleId, editPermissionsUser, reloadPermissions])

  // -------------------- DETECTAR CAMBIOS --------------------
  const hasChanges = useMemo(() => {
    if (editPermissionsUser && selectedRoleId !== originalRoleId) return true
    if (rolPermisoIds.size !== permisoIdsOriginales.size) return true
    for (const id of rolPermisoIds) {
      if (!permisoIdsOriginales.has(id)) return true
    }
    return false
  }, [rolPermisoIds, permisoIdsOriginales, selectedRoleId, originalRoleId, editPermissionsUser])

  // -------------------- HANDLERS --------------------
  const handleRoleChange = (roleId: number) => {
    if (saving) return
    setSaveStatus("idle")
    setPermissionsLoading(true)
    setSelectedRoleId(roleId)
  }

  const togglePermission = (idPermiso: number) => {
    setSaveStatus("idle")
    setRolPermisoIds((current) => {
      const next = new Set(current)
      if (next.has(idPermiso)) next.delete(idPermiso)
      else next.add(idPermiso)
      return next
    })
  }

  const guardarPermisos = async () => {
    if (!authUser || !isAdmin || saving || permissionsLoading || permissionsError || !hasChanges) return
    setSaving(true)
    setSaveError("")
    setSaveStatus("saving")
    try {
      // Construimos el objeto JSON para permisos personalizados
      const permisosObj: Record<string, boolean> = {}
      catalogo.forEach((p) => {
        permisosObj[`${p.modulo}:${p.nombre}`] = rolPermisoIds.has(p.id)
      })

      let res
      if (editPermissionsUser) {
        // Guardar permisos personalizados
        res = await apiFetch(`/api/usuarios/${editPermissionsUser.id}/permisos/`, {
          method: "PUT",
          headers: authHeaders(authUser),
          body: JSON.stringify({ permisos: permisosObj, rol: ROLE_DISPLAY[selectedRoleId] }),
        })
      } else {
        // Guardar permisos globales del rol
        res = await apiFetch(`/api/roles/${selectedRoleId}/permisos/`, {
          method: "PUT",
          headers: authHeaders(authUser),
          body: JSON.stringify({ permisos: Array.from(rolPermisoIds) }),
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || "No se pudieron guardar los permisos")
      }
      
      const saved = await res.json()
      if (editPermissionsUser) {
        onPermissionsSaved(saved)
        setEditPermissionsUser(saved)
        setOriginalRoleId(saved.id_rol)
      }
      setPermisoIdsOriginales(new Set(rolPermisoIds))
      setSaveStatus("saved")

    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Error al guardar")
      setSaveStatus("error")

    } finally {
      setSaving(false)
    }
  }

  const saveNewUser = async () => {
    setSaving(true)
    setSaveError("")
    try {
      await onCreate(newUser)
      setShowNew(false)
      setNewUser({ nombre: "", email: "", rol: "Usuario base", estado: "Activo" })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo crear el usuario")
    } finally {
      setSaving(false)
    }
  }

  const openEditUser = (user: User) => {
    setEditUser(user)
    setEditForm({
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
      password: "",
    })
    setSaveError("")
    setShowEdit(true)
  }

  const saveEditUser = async () => {
    if (!editUser) return
    setSaving(true)
    setSaveError("")
    try {
      const payload: any = {
        nombre: editForm.nombre,
        email: editForm.email,
        rol: editForm.rol,
        estado: editForm.estado,
      }
      if (editForm.password.trim() !== "") {
        payload.contrasena = editForm.password
      }

      await onUpdate(editUser, payload)
      setShowEdit(false)
      setEditUser(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo actualizar el usuario")
    } finally {
      setSaving(false)
    }
  }

  const openEditPermissions = (user: User) => {
    if (saving) return
    setSaveStatus("idle")
    setPermissionsLoading(true)
    setSelectedRoleId(user.id_rol ?? Number(Object.keys(ROLE_DISPLAY).find((id) => ROLE_DISPLAY[Number(id)] === user.rol) ?? 3))
    setEditPermissionsUser(user)
    setSaveError("")
    permissionsPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // -------------------- AGRUPAR CATÁLOGO POR MÓDULO --------------------
  const grupos = useMemo(() => {
    const map = new Map<string, PermisoCatalogo[]>()
    catalogo.forEach((p) => {
      if (!map.has(p.modulo)) map.set(p.modulo, [])
      map.get(p.modulo)!.push(p)
    })
    return Array.from(map.entries())
  }, [catalogo])

  // -------------------- RENDER --------------------
  return (
    <div>
      <PageTitle title="Gestión de Usuarios" sub="Usuarios, roles y permisos del sistema">
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Ico p={I.plus} size={14} /> Nuevo usuario
          </button>
        )}
      </PageTitle>

      {loadError && (
        <div className="panel" style={{ padding: 20, color: "#B91C1C" }}>
          {loadError}
        </div>
      )}

      <div className="panel usuarios-table">
        <table className="dt w-full">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((user) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 600 }}>{user.nombre}</td>
                <td>{user.email}</td>
                <td>
                  <Badge t={user.rol === "Superusuario / Admin" ? "danger" : user.rol === "Usuario con privilegios" ? "info" : "neutral"}>
                    {user.rol}
                  </Badge>
                </td>
                <td><Badge t="ok">{user.estado}</Badge></td>
                {isAdmin && (
                  <td><div className="usuarios-row-actions">
                    <button className="btn btn-ghost btn-sm productos-edit-btn" title="Editar" aria-label={`Editar ${user.nombre}`} onClick={() => openEditUser(user)}>
                      <Ico p={I.edit} size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Permisos" aria-label={`Permisos de ${user.nombre}`} disabled={saving} onClick={() => openEditPermissions(user)}>
                      <Ico p={I.lock} size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm productos-delete-btn" title="Eliminar" aria-label={`Eliminar ${user.nombre}`} onClick={async () => {
                      if (!window.confirm(`¿Eliminar a ${user.nombre}?`)) return
                      await onDelete(user)
                    }}>
                      <Ico p={I.trash} size={13} />
                    </button>
                  </div></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <>
          <div className="panel usuarios-panel" ref={permissionsPanel}>
            <div className="panel-header">
              <span className="usuarios-section-title">Roles y permisos</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {saveStatus === "saving" && <Badge t="warn">Guardando…</Badge>}
                {saveStatus === "saved" && <Badge t="ok">Guardado ✓</Badge>}
                {saveStatus === "error" && <Badge t="danger">Error al guardar</Badge>}
                {hasChanges && saveStatus === "idle" && <Badge t="info">Cambios sin guardar</Badge>}
              </div>
            </div>

            <div className="usuarios-target" aria-live="polite">
              <div><strong>{editPermissionsUser ? `Editando a ${editPermissionsUser.nombre}` : "Configuración global de roles"}</strong>
                <p>{editPermissionsUser ? `${editPermissionsUser.email} · Rol actual: ${editPermissionsUser.rol}` : "Los cambios globales se aplican a quienes heredan permisos del rol."}</p>
              </div>
              {editPermissionsUser && <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => {
                setSaveStatus("idle")
                setPermissionsLoading(true)
                setEditPermissionsUser(null)
              }}>Ver roles globales</button>}
            </div>
            <div className="usuarios-roles-grid">
              {[1, 2, 3].map((roleId) => (
                <button
                  key={roleId}
                  aria-pressed={selectedRoleId === roleId}
                  disabled={saving}
                  onClick={() => handleRoleChange(roleId)}
                  className={`usuarios-role-card ${selectedRoleId === roleId ? "active" : "inactive"}`}
                >
                  <div className="usuarios-role-title">{ROLE_DISPLAY[roleId]}</div>
                  <div className="usuarios-role-desc">
                    {roleId === 1 ? "Acceso total a todos los módulos." : roleId === 2 ? "Permisos seleccionables por módulo." : "Permisos de acceso iniciales."}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel usuarios-permissions-panel" aria-busy={permissionsLoading}>
            <div className="panel-header">
              <span className="usuarios-section-title">
                Funcionalidades y permisos
              </span>
              {/* 👇 BADGE DINÁMICO */}
              <Badge t="info">
                {editPermissionsUser ? "Editando permisos de " + editPermissionsUser.nombre + " (" + editPermissionsUser.email + ")" : ROLE_DISPLAY[selectedRoleId]}
              </Badge>
            </div>

            {permissionsLoading ? <p className="usuarios-permissions-message" role="status">Cargando permisos…</p> : permissionsError ? (
              <div className="usuarios-permissions-message" role="alert">{permissionsError} <button className="btn btn-ghost btn-sm" onClick={() => setReloadPermissions((v) => v + 1)}>Reintentar</button></div>
            ) : <>
              {selectedRoleId === 1 && <p className="usuarios-permissions-message">El administrador tiene acceso total. Sus permisos no se pueden restringir.</p>}
              <div className="usuarios-permissions-grid">
                {grupos.map(([modulo, permisos]) => (
                  <fieldset className="usuarios-permission-module" key={modulo} disabled={saving || selectedRoleId === 1}>
                    <legend>{NOMBRES_MODULO[modulo] ?? modulo}</legend>
                    <div className="usuarios-permission-options">
                      {permisos.map((permiso) => (
                        <label key={permiso.id} title={permiso.descripcion}>
                          <input type="checkbox" checked={rolPermisoIds.has(permiso.id)} onChange={() => togglePermission(permiso.id)} />
                          <span>{permiso.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </>}

            <div className="usuarios-permission-actions">
              <button className="btn btn-primary" onClick={guardarPermisos} disabled={saving || permissionsLoading || !!permissionsError || !hasChanges}>
                <Ico p={I.check} size={14} /> {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {saveError && <span style={{ color: "#B91C1C", fontSize: "0.75rem" }}>{saveError}</span>}
              {!hasChanges && !saving && <span style={{ color: "#94A3B8", fontSize: "0.75rem" }}>Sin cambios pendientes.</span>}
            </div>
          </div>
        </>
      )}

      {/* MODAL NUEVO USUARIO */}
      {isAdmin && showNew && (
        <div className="modal-backdrop">
          <div className="modal usuarios-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="usuarios-modal-title">Nuevo usuario</h2>
            <div className="usuarios-form">
              <div className="field">
                <label className="label">Nombre completo</label>
                <input className="input" placeholder="Nombre del usuario" value={newUser.nombre} onChange={(e) => setNewUser((c) => ({ ...c, nombre: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Correo electrónico</label>
                <input className="input" type="email" placeholder="usuario@ecoterra.cl" value={newUser.email} onChange={(e) => setNewUser((c) => ({ ...c, email: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Rol</label>
                <select className="select" value={newUser.rol} onChange={(e) => setNewUser((c) => ({ ...c, rol: e.target.value }))}>
                  <option value="Superusuario / Admin">Superusuario / Admin</option>
                  <option value="Usuario con privilegios">Usuario con privilegios</option>
                  <option value="Usuario base">Usuario base</option>
                </select>
              </div>
            </div>
            {saveError && <p style={{ color: "#B91C1C", marginTop: 12 }}>{saveError}</p>}
            <div className="usuarios-form-actions">
              <button className="btn btn-primary" onClick={saveNewUser} disabled={saving}><Ico p={I.check} size={14} /> Guardar</button>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR USUARIO */}
      {isAdmin && showEdit && editUser && (
        <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
          <div className="modal usuarios-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="usuarios-modal-title">Editar usuario</h2>
            <div className="usuarios-form">
              <div className="field">
                <label className="label">Nombre completo</label>
                <input className="input" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Correo electrónico</label>
                <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Estado</label>
                <select className="select" value={editForm.estado} onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Nueva contraseña (opcional)</label>
                <input className="input" type="password" placeholder="Dejar en blanco para no cambiar" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
              </div>
            </div>
            {saveError && <p style={{ color: "#B91C1C", marginTop: 12 }}>{saveError}</p>}
            <div className="usuarios-form-actions">
              <button className="btn btn-primary" onClick={saveEditUser} disabled={saving}>
                <Ico p={I.check} size={14} /> {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowEdit(false)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}