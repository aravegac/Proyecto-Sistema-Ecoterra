// AppLayout.tsx
import React, { ReactNode, useState } from "react"

import logoEcoterra from "@/imports/logo_ecoterra.png"

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
          padding: "0 12px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {collapsed ? (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
              padding: 3,
            }}
          >
            <img
              src={logoEcoterra}
              alt="Ecoterra"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        ) : (
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
                background: "white",
                borderRadius: 8,
                padding: "5px 10px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <img
                src={logoEcoterra}
                alt="Ecoterra"
                style={{
                  height: 22,
                  width: "auto",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          </div>
        )}
        <button
          onClick={toggle}
          style={{
            marginLeft: collapsed ? "auto" : 0,
            color: "#475569",
            background: "none",
            border: "none",
            cursor: "pointer",
            lineHeight: 0,
            flexShrink: 0,
          }}
        >
          <Ico p={I.menu} size={15} />
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

// Muestra el módulo actual, la fecha, las notificaciones y los controles del usuario.
function Topbar({
  screen,
  user,
  onLogout,
}: {
  screen: Screen
  user: AuthUser | null
  onLogout: () => void
}) {
  const label =
    NAV.flatMap(/* Devuelve group.items al invocarse este callback. */ (group) => group.items).find(/* Identifica el elemento buscado evaluando item.id === screen. */ (item) => item.id === screen)
      ?.label ?? ""

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">
          <img src={logoEcoterra} alt="Ecoterra" />
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
        <button className="btn btn-ghost btn-sm" style={{ position: "relative" }}>
          <Ico p={I.alert} size={14} />
          <span
            className="badge badge-danger"
            style={{
              padding: "1px 5px",
              fontSize: "0.625rem",
              position: "absolute",
              top: -4,
              right: -4,
            }}
          >
            3
          </span>
        </button>

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
}: {
  screen: Screen
  onNav: (screen: Screen) => void
  user: AuthUser | null
  onLogout: () => void
  children: ReactNode
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
        toggle={/* Ejecuta setCollapsed(!collapsed) al invocarse este callback. */ () => setCollapsed(!collapsed)}
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
        <Topbar screen={screen} user={user} onLogout={onLogout} />
        <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {children}
        </main>
      </div>
    </div>
  )
}