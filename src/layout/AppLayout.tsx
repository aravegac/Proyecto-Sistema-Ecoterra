// AppLayout.tsx
import React, { ReactNode, useEffect, useRef, useState } from "react"

import BrandLogo from "../BrandLogo"

import { AuthUser, canAccessModule, I, Ico, Screen } from "../shared"

type NavItem = {
  id: Screen
  label: string
  icon: string
  moduleId?: string
}

type NavGroup = {
  label: string
  items: NavItem[]
}

type PrediccionStock = {
  id_producto: number
  codigo_producto?: string
  nombre_producto?: string
  stock_actual: number | string
  stock_minimo: number | string | null
  unidad_producto?: string
}

const NAV: NavGroup[] = [
  {
    label: "",
    items: [{ id: "dashboard", label: "Dashboard", icon: I.dashboard }],
  },
  {
    label: "Gestión Operativa",
    items: [
      { id: "clientes", label: "Clientes", icon: I.clients, moduleId: "clientes" },
      { id: "proveedores", label: "Proveedores", icon: I.products, moduleId: "proveedores" },
      { id: "productos", label: "Productos", icon: I.products, moduleId: "productos" },
    ],
  },
  {
    label: "Inventario",
    items: [
      { id: "lotes", label: "Control de Lotes", icon: I.lots, moduleId: "lotes" },
      { id: "movimientos", label: "Movimientos de Stock", icon: I.lots, moduleId: "movimientos" },
    ],
  },
  {
    label: "Ventas",
    items: [
      { id: "cotizaciones", label: "Cotizaciones", icon: I.quotes, moduleId: "cotizaciones" },
      { id: "oc", label: "Órdenes de Compra", icon: I.quotes, moduleId: "ordenes_compra" },
      { id: "facturacion", label: "Facturación", icon: I.invoice, moduleId: "facturacion" },
      { id: "nc", label: "Notas de Crédito", icon: I.invoice, moduleId: "notas_credito" },
    ],
  },
  {
    label: "Inteligencia Artificial",
    items: [{ id: "ia", label: "Panel Predictivo IA", icon: I.sparkle, moduleId: "ia" }],
  },
  {
    label: "Administración",
    items: [
      { id: "usuarios", label: "Gestión de Usuarios", icon: I.clients, moduleId: "usuarios_roles" },
    ],
  },
]

// Obtiene hasta dos iniciales en mayúsculas del nombre o un signo de interrogación si está vacío.
const getInitials = (nombre: string) =>
  nombre
    .split(" ")
    .map(/* Transforma cada elemento de la lista devolviendo n[0]. */ (n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?"

// Muestra el menú lateral con los módulos autorizados, la opción de contraerlo y los datos de la sesión.
function Sidebar({
  cur,
  onNav,
  collapsed,
  toggle,
  user,
  onLogout,
}: {
  cur: Screen
  onNav: (screen: Screen) => void
  collapsed: boolean
  toggle: () => void
  user: AuthUser | null
  onLogout: () => void
}) {
  return (
    <aside
      style={{
        width: collapsed ? 52 : 220,
        background: "#0F172A",
        flexShrink: 0,
        transition: "width 0.2s ease",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 56,
          borderBottom: "1px solid #1E293B",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 4px" : "0 12px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              style={{
                borderRadius: 8,
                padding: "5px 10px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <BrandLogo className="sidebar-logo" />
            </div>
          </div>
        )}
        <button
          onClick={toggle}
          className="sidebar-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          style={{
            marginLeft: 0,
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            color: "#CBD5E1",
            background: "none",
            border: "none",
            cursor: "pointer",
            lineHeight: 0,
            flexShrink: 0,
          }}
        >
          <Ico p={I.menu} size={20} />
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px 16px" }}>
        {NAV.map(/* Renderiza cada grupo del menú únicamente con sus módulos autorizados y oculta los grupos vacíos. */ (group, groupIndex) => {
          // Filtrar items por permisos
          const visibleItems = group.items.filter(/* Comprueba qué elementos cumplen la condición evaluando canAccessModule(user, item.moduleId). */ (item) =>
            canAccessModule(user, item.moduleId),
          )

          // Si el grupo no tiene items visibles, no lo renderices
          if (visibleItems.length === 0) return null

          return (
            <div key={groupIndex}>
              {!collapsed && group.label && (
                <div className="nav-section">{group.label}</div>
              )}
              {collapsed && group.label && <div style={{ height: 10 }} />}
              {visibleItems.map(/* Renderiza el contenido de cada elemento de visibleItems. */ (item) => (
                <div
                  key={item.id}
                  className={`nav-item ${cur === item.id ? "active" : ""}`}
                  onClick={/* Ejecuta onNav(item.id) al invocarse este callback. */ () => onNav(item.id)}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-icon">
                    <Ico p={item.icon} size={15} />
                  </span>
                  {!collapsed && item.label}
                </div>
              ))}
            </div>
          )
        })}
      </nav>

      {!collapsed && user && (
        <div
          style={{
            borderTop: "1px solid #1E293B",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#0052CC",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "0.6875rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {getInitials(user.nombre)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: "#E2E8F0",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={user.nombre}
            >
              {user.nombre}
            </div>
            <div
              style={{
                color: "#475569",
                fontSize: "0.6875rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={user.rol}
            >
              {user.rol}
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              borderRadius: 6,
            }}
            onMouseEnter={/* Actualiza el color y el fondo del botón según el evento del puntero. */ (e) => {
              e.currentTarget.style.color = "#DC2626"
              e.currentTarget.style.background = "#1E293B"
            }}
            onMouseLeave={/* Actualiza el color y el fondo del botón según el evento del puntero. */ (e) => {
              e.currentTarget.style.color = "#94A3B8"
              e.currentTarget.style.background = "none"
            }}
          >
            <Ico p={I.x} size={14} />
          </button>
        </div>
      )}
    </aside>
  )
}

// Representa una notificación activa de inventario.
type NotificacionStock = {
  id: string
  idProducto: number
  titulo: string
  codigo: string
  nombre: string
  mensaje: string
  tipo: "danger" | "warning"
}

// Lee los identificadores de las notificaciones que el usuario ya marcó como leídas.
const leerNotificacionesGuardadas = (clave: string): string[] => {
  try {
    const guardadas = localStorage.getItem(clave)

    if (!guardadas) return []

    const parsed = JSON.parse(guardadas)

    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : []
  } catch {
    return []
  }
}

// Muestra las alertas activas de inventario y permite gestionar su estado de lectura.
function NotificationBell({
  userId,
  predicciones,
  loading,
  error,
  onNav,
}: {
  userId: number
  predicciones: PrediccionStock[]
  loading: boolean
  error: string
  onNav: (screen: Screen) => void
}) {
  const storageKey = `ecoterra_notificaciones_leidas_${userId}`

  const [abierto, setAbierto] = useState(false)
  const [leidas, setLeidas] = useState<string[]>(() =>
    leerNotificacionesGuardadas(storageKey)
  )

  const panelRef = useRef<HTMLDivElement>(null)

  // Construye las notificaciones a partir de las predicciones recibidas.
  const notificaciones: NotificacionStock[] = predicciones
    .filter((producto) => {
      const stock = Number(producto.stock_actual)

      const minimo =
        producto.stock_minimo == null
          ? null
          : Number(producto.stock_minimo)

      if (!Number.isFinite(stock)) return false

      if (stock <= 0) return true

      return (
        minimo !== null &&
        Number.isFinite(minimo) &&
        minimo > 0 &&
        stock <= minimo
      )
    })
    .map((producto) => {
      const stock = Number(producto.stock_actual)
      const minimo =
        producto.stock_minimo == null
          ? null
          : Number(producto.stock_minimo)

      const agotado = stock <= 0
      const unidad = producto.unidad_producto || "L"

      return {
        id: `stock-${producto.id_producto}`,
        idProducto: producto.id_producto,
        titulo: agotado ? "Stock agotado" : "Stock bajo o en el mínimo",
        codigo: producto.codigo_producto || "",
        nombre:
          producto.nombre_producto ||
          `Producto ${producto.id_producto}`,
        mensaje: agotado
          ? "No hay unidades disponibles en inventario."
          : `${stock.toLocaleString("es-CL")} ${unidad} disponibles · Mínimo: ${minimo!.toLocaleString("es-CL")} ${unidad}.`,
        tipo: agotado ? "danger" as const : "warning" as const,
      }
    })

  // Identifica las alertas activas para detectar cuándo desaparecen del inventario.
  const idsActivos = notificaciones.map((notificacion) => notificacion.id)
  const idsActivosKey = idsActivos.sort().join("|")

  // Conserva el estado de lectura mientras la alerta siga activa.
  // Cuando desaparece del inventario, elimina su registro para que
  // pueda volver a generar una notificación nueva si reaparece.
  useEffect(() => {
    if (loading || error) return

    const activos = new Set(idsActivosKey ? idsActivosKey.split("|") : [])

    setLeidas((actuales) => {
      const actualizadas = actuales.filter((id) => activos.has(id))

      if (actualizadas.length !== actuales.length) {
        localStorage.setItem(storageKey, JSON.stringify(actualizadas))
      }

      return actualizadas
    })
  }, [storageKey, idsActivosKey, loading, error])

  // Cierra el panel al hacer clic fuera de él o al presionar Escape.
  useEffect(() => {
    if (!abierto) return

    const cerrarAlHacerClickFuera = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setAbierto(false)
      }
    }

    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAbierto(false)
      }
    }

    document.addEventListener("mousedown", cerrarAlHacerClickFuera)
    document.addEventListener("keydown", cerrarConEscape)

    return () => {
      document.removeEventListener("mousedown", cerrarAlHacerClickFuera)
      document.removeEventListener("keydown", cerrarConEscape)
    }
  }, [abierto])

  const noLeidas = notificaciones.filter(
    (notificacion) => !leidas.includes(notificacion.id)
  )

  const marcarComoLeida = (id: string) => {
    setLeidas((actuales) => {
      if (actuales.includes(id)) return actuales

      const actualizadas = [...actuales, id]

      localStorage.setItem(storageKey, JSON.stringify(actualizadas))

      return actualizadas
    })
  }

  const marcarTodasComoLeidas = () => {
    const ids = notificaciones.map((notificacion) => notificacion.id)

    setLeidas(ids)
    localStorage.setItem(storageKey, JSON.stringify(ids))
  }

  const seleccionarNotificacion = (id: string) => {
    marcarComoLeida(id)
    setAbierto(false)
    onNav("ia")
  }

  return (
    <div className="notification-wrapper" ref={panelRef}>
      <button
        className="btn btn-ghost btn-sm notification-trigger"
        type="button"
        onClick={() => setAbierto((actual) => !actual)}
        aria-label={`Notificaciones: ${noLeidas.length} sin leer`}
        aria-expanded={abierto}
        aria-haspopup="true"
        title="Notificaciones"
      >
        <Ico p={I.alert} size={15} />

        {noLeidas.length > 0 && (
          <span className="badge badge-danger notification-count">
            {noLeidas.length > 99 ? "99+" : noLeidas.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="notification-panel">
          <div className="notification-header">
            <div>
              <strong>Notificaciones</strong>
              <span>
                {noLeidas.length > 0
                  ? `${noLeidas.length} sin leer`
                  : "Todo al día"}
              </span>
            </div>

            {noLeidas.length > 0 && (
              <button
                type="button"
                className="notification-mark-all"
                onClick={marcarTodasComoLeidas}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="notification-empty">
                Consultando alertas de inventario...
              </div>
            ) : error ? (
              <div className="notification-empty notification-error">
                {error}
              </div>
            ) : notificaciones.length === 0 ? (
              <div className="notification-empty">
                <Ico p={I.check} size={22} />
                <span>No hay alertas de stock pendientes.</span>
              </div>
            ) : (
              notificaciones.map((notificacion) => {
                const leida = leidas.includes(notificacion.id)

                return (
                  <button
                    key={notificacion.id}
                    type="button"
                    className={`notification-item ${
                      leida ? "read" : "unread"
                    }`}
                    onClick={() =>
                      seleccionarNotificacion(notificacion.id)
                    }
                  >
                    <span
                      className={`notification-icon ${
                        notificacion.tipo
                      }`}
                    >
                      <Ico
                        p={I.alert}
                        size={16}
                      />
                    </span>

                    <span className="notification-content">
                      <strong>{notificacion.titulo}</strong>

                      <span className="notification-product">
                        {notificacion.nombre}
                        {notificacion.codigo
                          ? ` · ${notificacion.codigo}`
                          : ""}
                      </span>

                      <span className="notification-message">
                        {notificacion.mensaje}
                      </span>

                      <span className="notification-status">
                        {leida ? "Leída" : "Sin leer"}
                      </span>
                    </span>

                    {!leida && (
                      <span className="notification-unread-dot" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="notification-footer">
            <span>Alertas generadas a partir del inventario.</span>

            <button
              type="button"
              onClick={() => {
                setAbierto(false)
                onNav("ia")
              }}
            >
              Ver panel IA
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Muestra el módulo actual, la fecha, las notificaciones y los controles del usuario.
function Topbar({
  screen,
  user,
  onLogout,
  onNav,
  predicciones,
  loadingPredicciones,
  errorPredicciones,
}: {
  screen: Screen
  user: AuthUser | null
  onLogout: () => void
  onNav: (screen: Screen) => void
  predicciones: PrediccionStock[]
  loadingPredicciones: boolean
  errorPredicciones: string
}) {
  const label =
    NAV.flatMap(/* Devuelve group.items al invocarse este callback. */ (group) => group.items).find(/* Identifica el elemento buscado evaluando item.id === screen. */ (item) => item.id === screen)
      ?.label ?? ""

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">
          <BrandLogo />
        </div>
        <div className="topbar-context">
          <span className="topbar-company">Ecoterra</span>
          <span className="topbar-divider">/</span>
          <span className="topbar-page">{label}</span>
          <span className="topbar-date">
            {new Date().toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {user && (
          <NotificationBell
            key={user.id}
            userId={user.id}
            predicciones={predicciones}
            loading={loadingPredicciones}
            error={errorPredicciones}
            onNav={onNav}
          />
        )}

        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingLeft: 12,
              borderLeft: "1px solid #E2E8F0",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                lineHeight: 1.1,
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#0F172A",
                }}
              >
                {user.nombre}
              </span>
              <span style={{ fontSize: "0.625rem", color: "#64748B" }}>
                {user.rol}
              </span>
            </div>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#0052CC",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "0.6875rem",
                fontWeight: 700,
              }}
              title={user.nombre}
            >
              {getInitials(user.nombre)}
            </div>
            <button
              onClick={onLogout}
              className="btn btn-ghost btn-sm"
              title="Cerrar sesión"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#64748B",
              }}
            >
              <Ico p={I.lock} size={14} />
              <span style={{ fontSize: "0.75rem" }}>Salir</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Organiza el menú lateral, la barra superior y el contenido de la pantalla seleccionada.
export default function AppLayout({
  screen,
  onNav,
  user,
  onLogout,
  children,
  predicciones,
  loadingPredicciones,
  errorPredicciones,
}: {
  screen: Screen
  onNav: (screen: Screen) => void
  user: AuthUser | null
  onLogout: () => void
  children: ReactNode
  predicciones: PrediccionStock[]
  loadingPredicciones: boolean
  errorPredicciones: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        background: "#F1F5F9",
      }}
    >
      <Sidebar
        cur={screen}
        onNav={onNav}
        collapsed={collapsed}
        toggle={/* Ejecuta setCollapsed((current) => !current) al invocarse este callback. */ () => setCollapsed((current) => !current)}
        user={user}
        onLogout={onLogout}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Topbar
          screen={screen}
          user={user}
          onLogout={onLogout}
          onNav={onNav}
          predicciones={predicciones}
          loadingPredicciones={loadingPredicciones}
          errorPredicciones={errorPredicciones}
        />
        <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {children}
        </main>
      </div>
    </div>
  )
}