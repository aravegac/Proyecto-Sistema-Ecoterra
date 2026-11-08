import { apiFetch, SESSION_REJECTED_EVENT } from "./api"
// App.tsx
import React, { useEffect, useState } from "react"
import AppLayout from "./layout/AppLayout"
import Dashboard from "./modules/Dashboard"
import Clientes, { Address, AddressInput, Client, NewClientInput } from "./modules/Clientes"
import Proveedores, { Proveedor, ProveedorInput } from "./modules/Proveedores"
import Productos, { ProductInput } from "./modules/Productos"
import Lotes, { Lote, LoteInput } from "./modules/Lotes"
import Movimientos, { Movimiento, MovimientoInput } from "./modules/Movimientos"
import Cotizaciones from "./modules/Cotizaciones" // 👈 Quitamos { Invoice } de aquí
import OrdenesCompra, {
  type PurchaseOrder,
  mapOrdenFromApi,
} from "./modules/OrdenesCompra"
import Facturacion, { Invoice, mapFacturaFromApi } from "./modules/Facturacion" // 👈 Solo una vez, y trae el Invoice correcto
import NotasCredito from "./modules/NotasCredito"
import IaPanel from "./modules/IaPanel"
import Usuarios, { User, UserInput } from "./modules/Usuarios"
import {
  AuthUser,
  authHeaders,
  canAccessModule,
  SCREEN_TO_MODULE,
  Screen,
  Product,
} from "./shared"
import Login from "./modules/Login"
import { clearSession, readSession, saveSession, sessionExpiresAt } from "./session"

type PrediccionStock = {
  id_producto: number
  codigo_producto?: string
  nombre_producto?: string
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

  advertencia_modelo?: boolean
  tipo_advertencia?: string | null
  variables_fuera_rango?: string[]
  variables_atipicas?: string[]
  mensaje_advertencia?: string | null

  unidad_producto?: string
}

type RespuestaPrediccionesStock = {
  exito: boolean
  total_productos: number
  resultados: PrediccionStock[]
  mensaje?: string
  detalle?: string
}

// ---------- Mappers API -> UI ----------
// Adapta un cliente de la API y sus direcciones al formato utilizado por la interfaz.
const mapClientFromApi = (item: any) => ({
  id: item.id,
  rut: item.rut,
  razon: item.razon_social,
  fantasia: item.nombre_fantasia || item.razon_social,
  pais: item.pais || "",
  region: item.region || "",
  ciudad: item.ciudad,
  tel: item.telefono || "-",
  email: item.email || "-",
  rep: item.representante || "-",
  estado: item.estado,
  dirs: Array.isArray(item.direcciones) ? item.direcciones : [],
})

// Adapta los campos del producto y convierte sus existencias al formato numérico de la interfaz.
const mapProductFromApi = (item: any) => ({
  id: item.id,
  codigo: item.codigo,
  nombre: item.nombre,
  desc: item.descripcion || "",
  tipo: item.tipo,
  unidad: item.unidad,
  stockMin: Number(item.stock_minimo),
  stock: Number(item.stock_disponible),
  stockTotal: Number(item.stock_total),
  estado: item.estado ? "Activo" : "Inactivo",
})

// Adapta el usuario de la API y normaliza su rol, estado y permisos para la interfaz.
const mapUserFromApi = (item: any): User => ({
  id: item.id,
  nombre: item.nombre,
  email: item.email,
  rol: item.rol || "Usuario base",
  id_rol: item.id_rol,
  estado: item.estado || "Activo",
  permisos:
    typeof item.permisos === "object" && item.permisos !== null
      ? item.permisos
      : undefined,
})

// Adapta los datos del proveedor y completa los campos opcionales para mostrarlos en la interfaz.
const mapProveedorFromApi = (item: any): Proveedor => ({
  id: item.id,
  empresa: item.nombre_empresa,
  pais: item.pais,
  contacto: item.contacto,
  tel: item.telefono || "-",
  email: item.email || "-",
  // direccion: item.direccion || "",
  estado:
    item.estado === "Activo" || item.estado === "Inactivo"
      ? item.estado
      : "Activo",
})

// Adapta el lote de inventario y obtiene el código del producto asociado.
const mapLoteFromApi = (item: any, productos: any[]): Lote => {
  const producto = productos.find(/* Identifica el elemento buscado evaluando Number(p.id) === Number(item.id_producto). */ (p) => Number(p.id) === Number(item.id_producto))
  return {
    id: item.id,
    prod: producto?.codigo || String(item.id_producto),
    qty: Number(item.cantidad),
    envase: item.tipo_envase || "-",
    fabr: item.fecha_fabricacion || "",
    venc: item.fecha_vencimiento || "",
    ubic: item.ubicacion || "-",
    estado: item.estado || "Disponible",
  }
}

// Adapta un movimiento y resuelve su lote, usuario, fecha y cantidades para la interfaz.
const mapMovimientoFromApi = (
  item: any,
  lotes: any[],
  usuarios: any[],
): Movimiento => {
  const lote = lotes.find(/* Identifica el elemento buscado evaluando Number(l.id) === Number(item.id_inventario). */ (l) => Number(l.id) === Number(item.id_inventario))
  const usuario = usuarios.find(/* Identifica el elemento buscado evaluando Number(u.id) === Number(item.id_usuario). */ (u) => Number(u.id) === Number(item.id_usuario))
  const fecha = item.fecha_movimiento
    ? new Date(item.fecha_movimiento).toISOString().slice(0, 16).replace("T", " ")
    : ""
  return {
    id: item.id,
    ts: fecha,
    tipo: item.tipo_movimiento,
    prod: lote?.prod || "—",
    qty: Number(item.cantidad_movimiento),
    stockAnterior:
      item.stock_anterior != null ? Number(item.stock_anterior) : null,
    stockPosterior:
      item.stock_posterior != null ? Number(item.stock_posterior) : null,
    lote: lote?.id ? String(lote.id) : "—",
    ref: item.referencia || "—",
    observacion: item.observacion || "",
    user: usuario?.nombre || "—",
  }
}

// ---------- App ----------
// Gestiona la sesión, carga los datos de la API y conecta la navegación con las operaciones de cada módulo.
export default function App() {
  const [sessionExpired, setSessionExpired] = useState(() => sessionExpiresAt() <= Date.now())
  const [authUser, setAuthUser] = useState<AuthUser | null>(readSession)
  const [screen, setScreen] = useState<Screen>(() => {
    if (!authUser) return "login"
    const saved = window.location.hash.slice(1)
    return saved !== "login" && Object.prototype.hasOwnProperty.call(SCREEN_TO_MODULE, saved) ? saved as Screen : "dashboard"
  })
  const [productos, setProductos] = useState<Product[]>([])
  const [productosError, setProductosError] = useState("")
  const [productosLoading, setProductosLoading] = useState(true)
  const [clientes, setClientes] = useState<
    React.ComponentProps<typeof Clientes>["clientes"]
  >([])
  const [clientesError, setClientesError] = useState("")
  const [usuarios, setUsuarios] = useState<User[]>([])
  const [usuariosError, setUsuariosError] = useState("")
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedoresError, setProveedoresError] = useState("")
  const [lotes, setLotes] = useState<Lote[]>([])
  const [lotesError, setLotesError] = useState("")
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [movimientosError, setMovimientosError] = useState("")
  const [movimientosLoading, setMovimientosLoading] = useState(true)
  const [facturas, setFacturas] = useState<Invoice[]>([])
  const [facturasLoading, setFacturasLoading] = useState(true)
  const [facturasError, setFacturasError] = useState("")
  const [ordenes, setOrdenes] = useState<PurchaseOrder[]>([])
  const [prediccionesStock, setPrediccionesStock] = useState<PrediccionStock[]>([])
  const [prediccionesLoading, setPrediccionesLoading] = useState(true)
  const [prediccionesError, setPrediccionesError] = useState("")
  const [versionInventario, setVersionInventario] = useState(0)
  // Recarga las órdenes de compra con el token del usuario y actualiza su estado en la aplicación.
  const reloadOrdenes = async () => {
    if (!authUser) return

    const response = await apiFetch("/api/ordenes-compra/", {
      headers: authHeaders(authUser),
    })

    if (!response.ok) {
      throw new Error("No se pudieron actualizar las órdenes de compra.")
    }

    const data = await response.json()
    const items = Array.isArray(data) ? data : data.value || []

    setOrdenes(items.map(mapOrdenFromApi))
  }


  // ---------- Auth ----------
  // Guarda el usuario autenticado y abre el dashboard.
  const handleLogin = (user: AuthUser) => {
    setSessionExpired(false)
    saveSession(user)
    setAuthUser(user)
    window.history.replaceState(null, "", "#dashboard")
    setScreen("dashboard")
  }

  // Borra la sesión guardada y en memoria y vuelve a la pantalla de acceso.
  const handleLogout = () => {
    clearSession()
    setAuthUser(null)
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    setScreen("login")
  }

  useEffect(() => {
    if (!authUser) return
    const expire = () => {
      setSessionExpired(true)
      handleLogout()
    }
    const checkExpiry = () => {
      if (sessionExpiresAt() <= Date.now()) expire()
    }
    const rejected = (event: Event) => {
      if ((event as CustomEvent<string>).detail === authUser.token) expire()
    }
    const timer = window.setTimeout(expire, Math.max(0, sessionExpiresAt() - Date.now()))
    window.addEventListener(SESSION_REJECTED_EVENT, rejected)
    window.addEventListener("focus", checkExpiry)
    document.addEventListener("visibilitychange", checkExpiry)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(SESSION_REJECTED_EVENT, rejected)
      window.removeEventListener("focus", checkExpiry)
      document.removeEventListener("visibilitychange", checkExpiry)
    }
  }, [authUser])

  const navigate = (next: Screen) => {
    if (next === screen) return
    window.history.pushState(null, "", "#" + next)
    setScreen(next)
  }

  useEffect(() => {
    if (!authUser) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      return
    }
    const syncLocation = () => {
      const next = window.location.hash.slice(1)
      const valid = next !== "login" && Object.prototype.hasOwnProperty.call(SCREEN_TO_MODULE, next)
      if (!valid) window.history.replaceState(null, "", "#dashboard")
      setScreen(valid ? next as Screen : "dashboard")
    }
    syncLocation()
    window.addEventListener("hashchange", syncLocation)
    window.addEventListener("popstate", syncLocation)
    return () => {
      window.removeEventListener("hashchange", syncLocation)
      window.removeEventListener("popstate", syncLocation)
    }
  }, [authUser])

  // Bloquear navegación a módulos sin permiso (redirige al dashboard)
  useEffect(/* Vuelve al dashboard si la sesión no tiene acceso al módulo de la pantalla actual. */ () => {
    if (!authUser) return
    const currentModule = SCREEN_TO_MODULE[screen]
    if (currentModule && !canAccessModule(authUser, currentModule)) {
      window.history.replaceState(null, "", "#dashboard")
      setScreen("dashboard")
    }
  }, [screen, authUser])

  // ---------- Cargas iniciales (solo si hay sesión) ----------
  // Carga las predicciones de stock para compartirlas entre Dashboard e IA.
  useEffect(() => {
    let vigente = true

    const consultarPredicciones = async () => {
      if (!authUser) {
        setPrediccionesStock([])
        setPrediccionesLoading(false)
        setPrediccionesError("")
        return
      }

      setPrediccionesLoading(true)
      setPrediccionesError("")

      try {
        const response = await apiFetch("/api/predicciones/stock/", {
          method: "GET",
          headers: authHeaders(authUser),
        })

        const data: RespuestaPrediccionesStock = await response.json()

        if (response.status === 403) {
          throw new Error(
            "No tienes permisos para ver las notificaciones de predicción de stock."
          )
        }

        if (response.status === 401) {
          throw new Error(
            "Tu sesión ha expirado. Inicia sesión nuevamente para consultar las notificaciones."
          )
        }

        if (!response.ok) {
          throw new Error(
            data.detalle ||
            data.mensaje ||
            "No se pudieron obtener las predicciones de stock."
          )
        }

        if (!data.exito || !Array.isArray(data.resultados)) {
          throw new Error(
            data.mensaje ||
            "El servidor devolvió una respuesta de predicciones inválida."
          )
        }

        if (vigente) {
          setPrediccionesStock(data.resultados)
          setPrediccionesError("")
        }
      } catch (error) {
        if (vigente) {
          setPrediccionesStock([])
          setPrediccionesError(
            error instanceof Error
              ? error.message
              : "Ocurrió un error al consultar las predicciones de stock."
          )
        }
      } finally {
        if (vigente) {
          setPrediccionesLoading(false)
        }
      }
    }

    consultarPredicciones()

    return () => {
      vigente = false
    }
  }, [authUser?.token, versionInventario])

  const recargarPredicciones = () => {
    setVersionInventario(current => current + 1)
  }

  useEffect(/* Carga los clientes cuando cambia la sesión y guarda los errores de consulta. */ () => {
    if (!authUser) return
    apiFetch("/api/clientes/", { headers: authHeaders(authUser) })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
        if (!r.ok) throw new Error("No se pudo cargar clientes")
        return r.json()
      })
      .then(/* Procesa la respuesta actualizando setClientes, setClientesError. */ (data) => {
        if (!Array.isArray(data)) throw new Error("Formato inválido")
        setClientes(data.map(mapClientFromApi))
        setClientesError("")
      })
      .catch(/* Gestiona el error actualizando setProductos, setClientes, setClientesError. */ (error) => {
        setClientes([])
        setClientesError(
          error instanceof Error
            ? `${error.message}. Verifica que Django esté conectado a Supabase.`
            : "No se pudieron cargar los clientes.",
        )
      })
  }, [authUser])

  useEffect(/* Carga los usuarios cuando cambia la sesión y guarda los errores de consulta. */ () => {
    if (!authUser) return
    apiFetch("/api/usuarios/", { headers: authHeaders(authUser) })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
        if (!r.ok) throw new Error("No se pudo cargar usuarios")
        return r.json()
      })
      .then(/* Procesa la respuesta actualizando setUsuarios, setUsuariosError. */ (data) => {
        if (!Array.isArray(data)) throw new Error("Formato inválido")
        setUsuarios(data.map(mapUserFromApi))
        setUsuariosError("")
      })
      .catch(/* Gestiona el error actualizando setUsuarios, setUsuariosError. */ (error) => {
        setUsuarios([])
        setUsuariosError(
          error instanceof Error
            ? `${error.message}. Verifica que Django esté conectado a Supabase.`
            : "No se pudieron cargar los usuarios.",
        )
      })
  }, [authUser])

  useEffect(/* Carga los proveedores cuando cambia la sesión y guarda los errores de consulta. */ () => {
    if (!authUser) return
    apiFetch("/api/proveedores/", { headers: authHeaders(authUser) })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
        if (!r.ok) throw new Error("No se pudo cargar proveedores")
        return r.json()
      })
      .then(/* Procesa la respuesta actualizando setProveedores, setProveedoresError. */ (data) => {
        if (!Array.isArray(data)) throw new Error("Formato inválido")
        setProveedores(data.map(mapProveedorFromApi))
        setProveedoresError("")
      })
      .catch(/* Gestiona el error actualizando setProveedores, setProveedoresError. */ (error) => {
        setProveedores([])
        setProveedoresError(
          error instanceof Error
            ? `${error.message}. Verifica que Django esté conectado a Supabase.`
            : "No se pudieron cargar los proveedores.",
        )
      })
  }, [authUser])

  // Cargar productos + lotes (en cadena porque lotes dependen de productos)
  useEffect(/* Carga productos y después sus lotes de inventario para la sesión actual. */ () => {
    if (!authUser) return
    setProductosLoading(true)
    apiFetch("/api/productos/", { headers: authHeaders(authUser) })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
        if (!r.ok) throw new Error("No se pudo cargar productos")
        return r.json()
      })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (productosData) => {
        if (!Array.isArray(productosData)) throw new Error("Formato de productos inválido")
        const mappedProductos = productosData.map(mapProductFromApi)
        setProductosError("")
        setProductos(mappedProductos)
        setProductosLoading(false)

        return apiFetch("/api/inventario/", { headers: authHeaders(authUser) })
          .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
            if (!r.ok) throw new Error("No se pudo cargar inventario")
            return r.json()
          })
          .then(/* Procesa la respuesta actualizando setLotes, setLotesError. */ (lotesData) => {
            if (!Array.isArray(lotesData)) throw new Error("Formato inválido")
            setLotes(lotesData.map(/* Transforma cada elemento de la lista devolviendo mapLoteFromApi(l, mappedProductos). */ (l: any) => mapLoteFromApi(l, mappedProductos)))
            setLotesError("")
          })
          .catch((error) => {
            setLotes([])
            setLotesError(error instanceof Error ? error.message : "No se pudieron cargar los lotes.")
          })
      })
      .catch(/* Gestiona el error actualizando setProductos, setLotes, setLotesError. */ (error) => {
        setProductosError("No se pudieron actualizar los datos de stock. Vuelve a cargar la página.")
        setProductosLoading(false)
        setLotes([])
        setLotesError(
          error instanceof Error
            ? `${error.message}. Verifica que Django esté conectado a Supabase.`
            : "No se pudieron cargar los lotes.",
        )
      })
  }, [authUser])

  // Cargar movimientos (depende de lotes y usuarios para enriquecer)
  useEffect(/* Carga los movimientos y resuelve sus lotes y usuarios cuando cambian las dependencias del efecto. */ () => {
    if (!authUser) return
    const controller = new AbortController()
    setMovimientosLoading(true)

    apiFetch("/api/movimientos/", { headers: authHeaders(authUser), signal: controller.signal })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
        if (!r.ok) throw new Error("No se pudo cargar movimientos")
        return r.json()
      })
      .then(/* Procesa la respuesta actualizando setMovimientos, setMovimientosError. */ (data) => {
        if (controller.signal.aborted) return
        if (!Array.isArray(data)) throw new Error("Formato inválido")
        setMovimientos(data.map(/* Transforma cada elemento de la lista devolviendo mapMovimientoFromApi(m, lotes, usuarios). */ (m: any) => mapMovimientoFromApi(m, lotes, usuarios)))
        setMovimientosError("")
      })
      .catch(/* Gestiona el error actualizando setMovimientos, setMovimientosError. */ (error) => {
        if (controller.signal.aborted) return
        setMovimientos([])
        setMovimientosError(
          error instanceof Error
            ? `${error.message}. Verifica que Django esté conectado a Supabase.`
            : "No se pudieron cargar los movimientos.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setMovimientosLoading(false)
      })
    return () => controller.abort()
  }, [authUser, lotes, usuarios])

  // Cargar facturas desde el backend
  useEffect(/* Carga las facturas de la sesión actual y vacía el listado si falla la consulta. */ () => {
    if (!authUser) return
    const controller = new AbortController()
    setFacturasLoading(true)
    setFacturasError("")
    apiFetch("/api/facturas/", { headers: authHeaders(authUser), signal: controller.signal })
      .then(/* Comprueba que la respuesta HTTP sea exitosa y devuelve su contenido JSON. */ (r) => {
        if (!r.ok) throw new Error("No se pudo cargar facturas")
        return r.json()
      })
      .then(/* Procesa la respuesta actualizando setFacturas. */ (data) => {
        if (controller.signal.aborted) return
        const items = Array.isArray(data) ? data : data.value
        if (!Array.isArray(items)) throw new Error("Formato de facturas inválido")
        setFacturas(items.map(mapFacturaFromApi))
      })
      .catch(/* Gestiona el error actualizando setFacturas. */ (error) => {
        if (controller.signal.aborted) return
        console.error("Error cargando facturas:", error)
        setFacturas([])
        setFacturasError("No se pudieron cargar las facturas.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setFacturasLoading(false)
      })
    return () => controller.abort()
  }, [authUser])

  // Cargar órdenes de compra desde el backend
  
  useEffect(/* Recarga las órdenes al cambiar la sesión y limpia el listado si falla la carga. */ () => {
    if (!authUser) return

    reloadOrdenes().catch(/* Gestiona el error actualizando setOrdenes. */ (error) => {
      console.error("Error cargando órdenes:", error)
      setOrdenes([])
    })
  }, [authUser])


  // ---------- Handlers Usuarios ----------
  // Crea un usuario mediante la API y lo añade a la lista local.
  const createUser = async (input: UserInput) => {
    const response = await apiFetch("/api/usuarios/", {
      method: "POST",
      headers: authHeaders(authUser),
      body: JSON.stringify({
        nombre: input.nombre,
        email: input.email,
        rol: input.rol,
        estado: input.estado,
        permisos: input.permisos ?? {},
      }),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo guardar el usuario",
      )
    }
    const created = mapUserFromApi(await response.json())
    setUsuarios(/* Calcula el nuevo valor de Usuarios devolviendo [...current, created]. */ (current) => [...current, created])
    return created
  }

  // Actualiza el usuario mediante la API y reemplaza sus datos en la lista local.
  const updateUser = async (user: User, input: UserInput) => {
    // 1. Armamos el body base con los campos que siempre se envían
    const bodyData: any = {
      nombre: input.nombre,
      email: input.email,
      rol: input.rol,
      estado: input.estado,
      ...(input.permisos !== undefined ? { permisos: input.permisos } : {}),
    }

    // 2. Si el usuario escribió una nueva contraseña, la agregamos al body
    if (input.contrasena && input.contrasena.trim() !== "") {
      bodyData.contrasena = input.contrasena
    }

    const response = await apiFetch(`/api/usuarios/${user.id}/`, {
      method: "PATCH",
      headers: authHeaders(authUser),
      body: JSON.stringify(bodyData), //  Enviamos el body modificado
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo actualizar el usuario",
      )
    }
    const updated = mapUserFromApi(await response.json())
    setUsuarios((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
    return updated
  }

  // Elimina el usuario mediante la API y lo retira de la lista local.
  const deleteUser = async (user: User) => {
    const response = await apiFetch(`/api/usuarios/${user.id}/`, {
      method: "DELETE",
      headers: authHeaders(authUser),
    })
    if (!response.ok) throw new Error("No se pudo eliminar el usuario")
    setUsuarios(/* Calcula el nuevo valor de Usuarios devolviendo current.filter((item) => item.id !== user.id). */ (current) => current.filter(/* Comprueba qué elementos cumplen la condición evaluando item.id !== user.id. */ (item) => item.id !== user.id))
  }

  // ---------- Handlers Proveedores ----------
  // Convierte el formulario de proveedor a los nombres de campos esperados por la API.
  const proveedorPayload = (input: ProveedorInput) => ({
    nombre_empresa: input.empresa,
    pais: input.pais,
    contacto: input.contacto,
    telefono: input.tel,
    email: input.email,
    // direccion: input.direccion,
    estado: input.estado,
  })

  // Crea un proveedor mediante la API y lo añade a la lista local.
  const createProveedor = async (input: ProveedorInput) => {
    const response = await apiFetch("/api/proveedores/", {
      method: "POST",
      headers: authHeaders(authUser),
      body: JSON.stringify(proveedorPayload(input)),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo guardar el proveedor",
      )
    }
    const created = mapProveedorFromApi(await response.json())
    setProveedores(/* Calcula el nuevo valor de Proveedores devolviendo [...current, created]. */ (current) => [...current, created])
    return created
  }

  // Actualiza el proveedor mediante la API y reemplaza sus datos en la lista local.
  const updateProveedor = async (proveedor: Proveedor, input: ProveedorInput) => {
    const response = await apiFetch(`/api/proveedores/${proveedor.id}/`, {
      method: "PATCH",
      headers: authHeaders(authUser),
      body: JSON.stringify(proveedorPayload(input)),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo actualizar el proveedor",
      )
    }
    const updated = mapProveedorFromApi(await response.json())
    setProveedores(/* Calcula el nuevo valor de Proveedores devolviendo current.map((item) => (item.id === updated.id ? updated : item)). */ (current) =>
      current.map(/* Transforma cada elemento de la lista devolviendo (item.id === updated.id ? updated : item). */ (item) => (item.id === updated.id ? updated : item)),
    )
    return updated
  }

  // Elimina el proveedor mediante la API y lo retira de la lista local.
  const deleteProveedor = async (proveedor: Proveedor) => {
    const response = await apiFetch(`/api/proveedores/${proveedor.id}/`, {
      method: "DELETE",
      headers: authHeaders(authUser),
    })
    if (!response.ok) throw new Error("No se pudo eliminar el proveedor")
    setProveedores(/* Calcula el nuevo valor de Proveedores devolviendo current.filter((item) => item.id !== proveedor.id). */ (current) => current.filter(/* Comprueba qué elementos cumplen la condición evaluando item.id !== proveedor.id. */ (item) => item.id !== proveedor.id))
  }

  // ---------- Handlers Clientes ----------
  // Crea un cliente mediante la API y lo añade a la lista local.
  const createClient = async (input: NewClientInput) => {
    const response = await apiFetch("/api/clientes/", {
      method: "POST",
      headers: authHeaders(authUser),
      body: JSON.stringify({
        rut: input.rut,
        razon_social: input.razon_social,
        nombre_fantasia: input.nombre_fantasia,
        pais: input.pais,
        region: input.region,
        ciudad: input.ciudad,
        telefono: input.telefono,
        email: input.email,
        representante: input.representante,
        estado: input.estado,
      }),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo guardar el cliente",
      )
    }
    const created = mapClientFromApi(await response.json())
    setClientes(/* Calcula el nuevo valor de Clientes devolviendo [...current, created]. */ (current) => [...current, created])
    return created
  }

  // Actualiza el cliente mediante la API y reemplaza sus datos en la lista local.
  const updateClient = async (client: Client, input: NewClientInput) => {
    const response = await apiFetch(`/api/clientes/${client.id}/`, {
      method: "PATCH",
      headers: authHeaders(authUser),
      body: JSON.stringify({
        rut: input.rut,
        razon_social: input.razon_social,
        nombre_fantasia: input.nombre_fantasia,
        pais: input.pais,
        region: input.region,
        ciudad: input.ciudad,
        telefono: input.telefono,
        email: input.email,
        representante: input.representante,
        estado: input.estado,
      }),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo actualizar el cliente",
      )
    }
    const updated = mapClientFromApi(await response.json())
    setClientes(/* Calcula el nuevo valor de Clientes devolviendo current.map((item) => (item.id === updated.id ? updated : item)). */ (current) =>
      current.map(/* Transforma cada elemento de la lista devolviendo (item.id === updated.id ? updated : item). */ (item) => (item.id === updated.id ? updated : item)),
    )
    return updated
  }

  // Elimina el cliente mediante la API y lo retira de la lista local.
  const deleteClient = async (
    client: React.ComponentProps<typeof Clientes>["clientes"][number],
  ) => {
    const response = await apiFetch(`/api/clientes/${client.id}/`, {
      method: "DELETE",
      headers: authHeaders(authUser),
    })
    if (!response.ok) {
      // 👇 Capturamos el mensaje del backend
      const errorData = await response.json().catch(() => null)
      throw new Error(
        errorData?.error || "No se pudo eliminar el cliente"
      )
    }
    setClientes((current) => current.filter((item) => item.id !== client.id))
  }

  // Crea una dirección del cliente mediante la API y actualiza sus direcciones locales.
  const createAddress = async (client: Client, input: AddressInput) => {
    const response = await apiFetch(`/api/clientes/${client.id}/direcciones/`, {
      method: "POST",
      headers: authHeaders(authUser),
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo crear la dirección",
      )
    }
    const created = (await response.json()) as Address
    setClientes(/* Calcula el nuevo valor de Clientes devolviendo current.map((item) => item.id === client.id ? { ...item, dirs: [...item.dirs, created] } : item, ). */ (current) =>
      current.map(/* Transforma cada elemento de la lista devolviendo item.id === client.id ? { ...item, dirs: [...item.dirs, created] } : item. */ (item) =>
        item.id === client.id ? { ...item, dirs: [...item.dirs, created] } : item,
      ),
    )
    return created
  }

  // Actualiza una dirección mediante la API y reemplaza sus datos en el cliente local.
  const updateAddress = async (client: Client, address: Address, input: AddressInput) => {
    const response = await apiFetch(
      `/api/clientes/${client.id}/direcciones/${address.id}/`,
      {
        method: "PATCH",
        headers: authHeaders(authUser),
        body: JSON.stringify(input),
      },
    )
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo actualizar la dirección",
      )
    }
    const updated = (await response.json()) as Address
    setClientes(/* Calcula el nuevo valor de Clientes devolviendo current.map((item) => item.id === client.id ? { ...item, dirs: item.dirs.map((a) => (a.id === updated.id ? updated : a)), } : item, ). */ (current) =>
      current.map(/* Transforma cada elemento de la lista devolviendo item.id === client.id ? { ...item, dirs: item.dirs.map((a) => (a.id === updated.id ? updated : a)), } : item. */ (item) =>
        item.id === client.id
          ? {
              ...item,
              dirs: item.dirs.map(/* Transforma cada elemento de la lista devolviendo (a.id === updated.id ? updated : a). */ (a) => (a.id === updated.id ? updated : a)),
            }
          : item,
      ),
    )
    return updated
  }

  // Elimina una dirección mediante la API y la retira de las direcciones del cliente local.
  const deleteAddress = async (client: Client, address: Address) => {
    const response = await apiFetch(
      `/api/clientes/${client.id}/direcciones/${address.id}/`,
      { method: "DELETE", headers: authHeaders(authUser) },
    )
    if (!response.ok) throw new Error("No se pudo eliminar la dirección")
    setClientes(/* Calcula el nuevo valor de Clientes devolviendo current.map((item) => item.id === client.id ? { ...item, dirs: item.dirs.filter((a) => a.id !== address.id) } : item, ). */ (current) =>
      current.map(/* Transforma cada elemento de la lista devolviendo item.id === client.id ? { ...item, dirs: item.dirs.filter((a) => a.id !== address.id) } : item. */ (item) =>
        item.id === client.id
          ? { ...item, dirs: item.dirs.filter(/* Comprueba qué elementos cumplen la condición evaluando a.id !== address.id. */ (a) => a.id !== address.id) }
          : item,
      ),
    )
  }

  // ---------- Handlers Productos ----------
  // Convierte el formulario de producto a los nombres de campos esperados por la API.
  const productPayload = (input: ProductInput) => ({
    codigo: input.codigo,
    nombre: input.nombre,
    descripcion: input.descripcion,
    tipo: input.tipo,
    unidad: input.unidad,
    stock_minimo: input.stockMinimo,
    estado: input.estado === "Activo",
  })

  // Crea un producto mediante la API y lo añade a la lista local.
  const createProduct = async (input: ProductInput) => {
    const response = await apiFetch("/api/productos/", {
      method: "POST",
      headers: authHeaders(authUser),
      body: JSON.stringify(productPayload(input)),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo crear el producto",
      )
    }
    const created = mapProductFromApi(await response.json())
    setProductos(/* Calcula el nuevo valor de Productos devolviendo [...current, created]. */ (current) => [...current, created])
    setVersionInventario(current => current + 1)
    return created
  }

  // Actualiza el producto mediante la API y reemplaza sus datos en la lista local.
  const updateProduct = async (
    product: React.ComponentProps<typeof Productos>["productos"][number],
    input: ProductInput,
  ) => {
    const response = await apiFetch(`/api/productos/${product.id}/`, {
      method: "PATCH",
      headers: authHeaders(authUser),
      body: JSON.stringify(productPayload(input)),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo actualizar el producto",
      )
    }
    const updated = mapProductFromApi(await response.json())
    setProductos(/* Calcula el nuevo valor de Productos devolviendo current.map((item) => (item.id === updated.id ? updated : item)). */ (current) =>
      current.map(/* Transforma cada elemento de la lista devolviendo (item.id === updated.id ? updated : item). */ (item) => (item.id === updated.id ? updated : item)),
    )
    setVersionInventario(current => current + 1)
    if (product.codigo !== updated.codigo) {
      setLotes((current) => current.map((lote) => lote.prod === product.codigo ? { ...lote, prod: updated.codigo } : lote))
    }
    return updated
  }

  // Elimina el producto mediante la API y lo retira de la lista local.
  const deleteProduct = async (
    product: React.ComponentProps<typeof Productos>["productos"][number],
  ) => {
    const response = await apiFetch(`/api/productos/${product.id}/`, {
      method: "DELETE",
      headers: authHeaders(authUser),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo eliminar el producto",
      )
    }
    setProductos(/* Calcula el nuevo valor de Productos devolviendo current.filter((item) => item.id !== product.id). */ (current) => current.filter(/* Comprueba qué elementos cumplen la condición evaluando item.id !== product.id. */ (item) => item.id !== product.id))
    setVersionInventario(current => current + 1)
  }

  // Los saldos de los lotes confirmados por la API alimentan también Productos y Dashboard.
  const syncInventory = (next: Lote[]) => {
    setLotes(next)
    setProductos((current) => current.map((product) => {
      const batches = next.filter((lote) => lote.prod === product.codigo)
      return { ...product,
        stock: batches.filter((lote) => lote.estado === "Disponible").reduce((sum, lote) => sum + lote.qty, 0),
        stockTotal: batches.reduce((sum, lote) => sum + lote.qty, 0),
      }
    }))
    setVersionInventario(current => current + 1)
  }

  // ---------- Handlers Lotes ----------
  // Resuelve el producto, crea el lote mediante la API y lo añade al inventario local.
  const createLote = async (input: LoteInput, id?: number) => {
    const producto = productos.find(/* Identifica el elemento buscado evaluando p.codigo === input.prod. */ (p: any) => p.codigo === input.prod)
    if (!producto) throw new Error("Producto no encontrado")

    const response = await apiFetch(id === undefined ? "/api/inventario/" : `/api/inventario/${id}/`, {
      method: id === undefined ? "POST" : "PATCH",
      headers: authHeaders(authUser),
      body: JSON.stringify({
        id_producto: producto.id,
        ...(id === undefined ? { cantidad: input.qty } : {}),
        tipo_envase: input.envase || "Tambor 200 L",
        fecha_fabricacion: input.fabr,
        fecha_vencimiento: input.venc,
        ubicacion: input.ubic || "",
        estado: input.estado || "Disponible",
      }),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData
          ? Object.values(errorData).flat().join(" ")
          : "No se pudo crear el lote",
      )
    }
    const created = mapLoteFromApi(await response.json(), productos)
    syncInventory(id === undefined ? [...lotes, created] : lotes.map((lote) => lote.id === created.id ? created : lote))
    return created
  }

  // Elimina el lote mediante la API y lo retira del inventario local.
  const deleteLote = async (lote: Lote) => {
    const response = await apiFetch(`/api/inventario/${lote.id}/`, {
      method: "DELETE",
      headers: authHeaders(authUser),
    })
    if (!response.ok) throw new Error("No se pudo eliminar el lote")
    syncInventory(lotes.filter((item) => item.id !== lote.id))
  }

  // ---------- Handlers Movimientos ----------
  // Registra el movimiento mediante la API, lo añade a la lista local y recarga el inventario.
  const createMovimiento = async (input: MovimientoInput) => {
    const response = await apiFetch("/api/movimientos/", {
      method: "POST",
      headers: authHeaders(authUser),
      body: JSON.stringify({
        id_inventario: input.id_inventario,
        id_usuario: input.id_usuario,
        tipo_movimiento: input.tipo,
        cantidad_movimiento: input.cantidad_movimiento,
        referencia: input.referencia || null,
        observacion: input.observacion || null,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(/* Devuelve null cuando falla la operación anterior. */ () => null)
      throw new Error(
        errorData?.detail ||
          (errorData
            ? Object.values(errorData).flat().join(" ")
            : "No se pudo registrar el movimiento"),
      )
    }

    const raw = await response.json()
    const created = mapMovimientoFromApi(raw, lotes, usuarios)

    setMovimientos(/* Calcula el nuevo valor de Movimientos devolviendo [created, ...current]. */ (current) => [created, ...current])

    // El backend devuelve el saldo resultante del movimiento; se refleja sin otra recarga.
    if (raw.stock_posterior != null) {
      syncInventory(lotes.map((lote) => lote.id === Number(raw.id_inventario)
        ? { ...lote, qty: Number(raw.stock_posterior) } : lote))
    }

    return created
  }


  // ---------- Vistas ----------
  const views: Record<Screen, React.ReactNode> = {
    dashboard: (
      <Dashboard
        authUser={authUser}
        productos={productos}
        productosError={productosError}
        productosLoading={productosLoading}
        facturas={facturas}
        facturasLoading={facturasLoading}
        facturasError={facturasError}
        movimientos={movimientos}
        movimientosLoading={movimientosLoading}
        movimientosError={movimientosError}
        predicciones={prediccionesStock}
        loadingPredicciones={prediccionesLoading}
        errorPredicciones={prediccionesError}
        onNav={navigate}
      />
    ),
    clientes: (
      <Clientes
        clientes={clientes}
        loadError={clientesError}
        authUser={authUser}
        onCreate={createClient}
        onDelete={deleteClient}
        onUpdate={updateClient}
        onCreateAddress={createAddress}
        onUpdateAddress={updateAddress}
        onDeleteAddress={deleteAddress}
      />
    ),
    proveedores: (
      <Proveedores
        proveedores={proveedores}
        loadError={proveedoresError}
        authUser={authUser}
        onCreate={createProveedor}
        onUpdate={updateProveedor}
        onDelete={deleteProveedor}
      />
    ),
    productos: (
      <Productos
        productos={productos}
        loadError={productosError}
        authUser={authUser}
        onCreate={createProduct}
        onUpdate={updateProduct}
        onDelete={deleteProduct}
      />
    ),
    lotes: (
      <Lotes
        lotes={lotes}
        productos={productos}
        loadError={lotesError}
        authUser={authUser}
        onCreate={createLote}
        onDelete={deleteLote}
      />
    ),
    movimientos: (
      <Movimientos
        productos={productos}
        lotes={lotes}
        movimientos={movimientos}
        usuarioId={authUser?.id ?? 0}
        loadError={movimientosError}
        authUser={authUser}
        onCreate={createMovimiento}
      />
    ),
    
    cotizaciones: (
      <Cotizaciones
        authUser={authUser}
        ordenes={ordenes}
        facturas={facturas}
        clientes={clientes}
        productos={productos}
        onOrdenesChange={reloadOrdenes}
      />
    ),

    
    oc: (
      <OrdenesCompra
        ordenes={ordenes}
        facturas={facturas}
        clientes={clientes}
        authUser={authUser}
        onOrdenesChange={reloadOrdenes}
      />
    ),
    facturacion: <Facturacion facturas={facturas} loading={facturasLoading} authUser={authUser} onCreated={/* Incorpora la factura creada al listado local calculando el total y evitando duplicados. */ (invoice) => {
      setFacturas(/* Calcula el nuevo valor de Facturas devolviendo [ { ...invoice, total: invoice.total ?? invoice.subtotal + invoice.iva, venc: invoice.fecha }, ...current.filter((item) => item.id !== invoice.id), ]. */ (current) => [
        { ...invoice, total: invoice.total ?? invoice.subtotal + invoice.iva, venc: invoice.fecha },
        ...current.filter(/* Comprueba qué elementos cumplen la condición evaluando item.id !== invoice.id. */ (item) => item.id !== invoice.id),
      ])
      setVersionInventario(current => current + 1)
    }} />,
    nc: <NotasCredito facturas={facturas} authUser={authUser} />,
    ia: (
      <IaPanel
        productos={productos}
        usuario={authUser}
        predicciones={prediccionesStock}
        loadingPredicciones={prediccionesLoading}
        errorPredicciones={prediccionesError}
        onRecargarPredicciones={recargarPredicciones}
      />
    ),
    usuarios: (
      <Usuarios
        usuarios={usuarios}
        loadError={usuariosError}
        onCreate={createUser}
        onDelete={deleteUser}
        onUpdate={updateUser}
        onPermissionsSaved={(updated) => {
          setUsuarios((current) => current.map((item) => item.id === updated.id ? updated : item))
          if (authUser?.id === updated.id) {
            const session = { ...authUser, ...updated, id_rol: updated.id_rol!, permisos: updated.permisos_efectivos ?? {} }
            saveSession(session, sessionExpiresAt())
            setAuthUser(session)
          }
        }}
        authUser={authUser}
      />
    ),
    login: <Login onEnter={handleLogin} />,
  }

  if (!authUser) {
    return <>
      <Login onEnter={handleLogin} />
      {sessionExpired && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-labelledby="session-expired-title">
            <h2 id="session-expired-title">Tu sesión se cerró</h2>
            <p>La sesión expiró. Vuelve a iniciar sesión para continuar.</p>
            <button className="btn btn-primary" onClick={() => setSessionExpired(false)} autoFocus>Aceptar</button>
          </div>
        </div>
      )}
    </>
  }

  return (
    <AppLayout
      screen={screen}
      onNav={navigate}
      user={authUser}
      onLogout={handleLogout}
      predicciones={prediccionesStock}
      loadingPredicciones={prediccionesLoading}
      errorPredicciones={prediccionesError}
    >
      {views[screen]}
    </AppLayout>
  )
}
