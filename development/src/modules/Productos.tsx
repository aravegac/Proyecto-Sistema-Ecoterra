// client/src/modules/Productos.tsx

import React, { useState } from "react"
import { Badge, fmt, I, Ico, PageTitle, Product } from "../shared"

export type ProductInput = {
  codigo: string
  nombre: string
  descripcion: string
  tipo: string
  unidad: string
  stockMinimo: number
  estado: string
}

type ProductProps = {
  productos: Product[]
  onCreate: (input: ProductInput) => Promise<Product>
  onUpdate: (product: Product, input: ProductInput) => Promise<Product>
  onDelete: (product: Product) => Promise<void>
}

const emptyProduct: ProductInput = {
  codigo: "",
  nombre: "",
  descripcion: "",
  tipo: "",
  unidad: "Litros",
  stockMinimo: 0,
  estado: "Activo",
}

// Muestra y filtra productos y gestiona sus formularios de creación, edición y eliminación.
export default function Productos({ productos, onCreate, onUpdate, onDelete }: ProductProps) {
  const [tipo, setTipo] = useState("")
  const [estado, setEstado] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductInput>(emptyProduct)
  const [error, setError] = useState("")

  const tipos = [...new Set(productos.map(/* Transforma cada elemento de la lista devolviendo product.tipo. */ (product) => product.tipo))]
  const estados = [...new Set(productos.map(/* Transforma cada elemento de la lista devolviendo product.estado. */ (product) => product.estado))]
  const filtered = productos.filter(
    /* Comprueba qué elementos cumplen la condición evaluando (!tipo || product.tipo === tipo) && (!estado || product.estado === estado). */ (product) =>
      (!tipo || product.tipo === tipo) &&
      (!estado || product.estado === estado),
  )

  // Cierra el formulario de producto, borra la selección de edición y limpia el error.
  const closeModal = () => {
    setShowModal(false)
    setEditingProduct(null)
    setError("")
  }

  // Valida código, nombre y stock mínimo y solicita crear o actualizar el producto.
  const saveProduct = async () => {
    // Validaciones
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError("Código y nombre son obligatorios.")
      return
    }
    if (form.stockMinimo < 0) {
      setError("El stock mínimo no puede ser negativo.")
      return
    }

    try {
      if (editingProduct) await onUpdate(editingProduct, form)
      else await onCreate(form)
      closeModal()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el producto")
    }
  }

  return (
    <div>
      <PageTitle
        title="Catálogo de Productos"
        sub="Polímeros industriales Ecoterra"
      >
        <button
          className="btn btn-primary"
          onClick={/* Limpia la selección y abre el formulario de creación de productos. */ () => {
            setEditingProduct(null)
            setForm(emptyProduct)
            setShowModal(true)
          }}
        >
          <Ico p={I.plus ?? "M12 5v14M5 12h14"} size={14} /> Nuevo producto
        </button>
      </PageTitle>
      <div className="panel">
        <div className="panel-header">
          <div className="productos-filter-row">
            <select
              className="select productos-filter-a"
              value={tipo}
              onChange={/* Ejecuta setTipo(event.target.value) al invocarse este callback. */ (event) => setTipo(event.target.value)}
            >
              <option value="">Todos los tipos</option>
              {tipos.map(/* Renderiza el contenido de cada elemento de tipos. */ (productType) => (
                <option key={productType} value={productType}>
                  {productType}
                </option>
              ))}
            </select>
            <select
              className="select productos-filter-b"
              value={estado}
              onChange={/* Ejecuta setEstado(event.target.value) al invocarse este callback. */ (event) => setEstado(event.target.value)}
            >
              <option value="">Todos los estados</option>
              {estados.map(/* Renderiza el contenido de cada elemento de estados. */ (productStatus) => (
                <option key={productStatus} value={productStatus}>
                  {productStatus}
                </option>
              ))}
            </select>
          </div>
          <span className="productos-count">{filtered.length} productos</span>
        </div>
        <table className="dt w-full">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Unidad</th>
              <th>Stock mín.</th>
              <th>Stock disp.</th>
              <th>Stock total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(/* Renderiza el contenido de cada elemento de filtered. */ (product) => (
              <tr key={product.id}>
                <td className="productos-code">{product.codigo}</td>
                <td>
                  <div className="productos-name">{product.nombre}</div>
                  <div className="productos-desc">{product.desc}</div>
                </td>
                <td>
                  <Badge t="info">{product.tipo}</Badge>
                </td>
                <td className="productos-unit">{product.unidad}</td>

                {/* Stock mínimo */}
                <td className="productos-meta" style={{ color: "#64748b" }}>
                  {fmt(product.stockMin)} L
                </td>

                {/* Stock disponible (con color según nivel) */}
                <td className="productos-meta">
                  <span
                    style={{
                      color:
                        product.stock === 0
                          ? "#DC2626"
                          : product.stock < product.stockMin
                            ? "#D97706"
                            : "#00995A",
                      fontWeight: 700,
                    }}
                  >
                    {fmt(product.stock)} L
                  </span>
                </td>

                {/* Stock total */}
                <td className="productos-meta" style={{ color: "#64748b" }}>
                  {fmt(product.stockTotal)} L
                </td>

                <td>
                  <Badge t={product.estado === "Activo" ? "ok" : "neutral"}>
                    {product.estado}
                  </Badge>
                </td>
                <td>
                  <div className="productos-actions">
                    <button
                      className="btn btn-ghost btn-sm productos-edit-btn"
                      title="Editar producto"
                      aria-label="Editar producto"
                      onClick={/* Carga los campos del producto seleccionado y abre su formulario de edición. */ () => {
                        setEditingProduct(product)
                        setForm({
                          codigo: product.codigo,
                          nombre: product.nombre,
                          descripcion: product.desc,
                          tipo: product.tipo,
                          unidad: product.unidad,
                          stockMinimo: product.stockMin,
                          estado: product.estado,
                        })
                        setShowModal(true)
                      }}
                    >
                      <Ico p={I.edit} size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm productos-delete-btn"
                      title="Eliminar producto"
                      aria-label="Eliminar producto"
                      onClick={/* Ejecuta setDeletingProduct(product) al invocarse este callback. */ () => setDeletingProduct(product)}
                    >
                      <Ico p={I.trash} size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="modal-backdrop">
          <div
            className="modal productos-modal"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
            key={editingProduct?.id ?? "new"}
          >
            <div className="productos-modal-header">
              <h2 className="productos-modal-title">
                {editingProduct ? "Editar Producto" : "Nuevo Producto"}
              </h2>
              <button
                onClick={closeModal}
                aria-label="Cerrar formulario"
                className="productos-modal-close"
              >
                <Ico p={I.x} size={18} />
              </button>
            </div>
            <div className="productos-form-grid">
              {/* Código */}
              <div className="field productos-span-1">
                <label className="label">Código</label>
                <input
                  className="input"
                  placeholder="Código"
                  value={form.codigo}
                  onChange={/* Ejecuta setForm((current) => ({ ...current, codigo: e.target.value })) al invocarse este callback. */ (e) =>
                    setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, codigo: e.target.value }). */ (current) => ({ ...current, codigo: e.target.value }))
                  }
                />
              </div>

              {/* Nombre */}
              <div className="field productos-span-1">
                <label className="label">Nombre</label>
                <input
                  className="input"
                  placeholder="Nombre"
                  value={form.nombre}
                  onChange={/* Ejecuta setForm((current) => ({ ...current, nombre: e.target.value })) al invocarse este callback. */ (e) =>
                    setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, nombre: e.target.value }). */ (current) => ({ ...current, nombre: e.target.value }))
                  }
                />
              </div>

              {/* Descripción */}
              <div className="field productos-span-2">
                <label className="label">Descripción</label>
                <input
                  className="input"
                  placeholder="Descripción"
                  value={form.descripcion}
                  onChange={/* Ejecuta setForm((current) => ({ ...current, descripcion: e.target.value })) al invocarse este callback. */ (e) =>
                    setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, descripcion: e.target.value }). */ (current) => ({ ...current, descripcion: e.target.value }))
                  }
                />
              </div>

              {/* Tipo */}
              <div className="field productos-span-1">
                <label className="label">Tipo</label>
                <input
                  className="input"
                  placeholder="Tipo"
                  value={form.tipo}
                  onChange={/* Ejecuta setForm((current) => ({ ...current, tipo: e.target.value })) al invocarse este callback. */ (e) =>
                    setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, tipo: e.target.value }). */ (current) => ({ ...current, tipo: e.target.value }))
                  }
                />
              </div>

              {/* Unidad (readonly) */}
              <div className="field productos-span-1">
                <label className="label">Unidad</label>
                <input
                  className="input"
                  value="Litros"
                  readOnly
                  disabled
                  style={{ background: "#F1F5F9", cursor: "not-allowed" }}
                />
              </div>

              {/* Stock Mínimo (min=0) */}
              <div className="field productos-span-1">
                <label className="label">Stock Mínimo</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.stockMinimo}
                  onChange={/* Actualiza el stock mínimo del formulario solo si el valor no es negativo. */ (e) => {
                    const val = Number(e.target.value)
                    if (val < 0) return
                    setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, stockMinimo: val }). */ (current) => ({ ...current, stockMinimo: val }))
                  }}
                />
              </div>

              {/* Estado */}
              <div className="field productos-span-1">
                <label className="label">Estado</label>
                <select
                  className="input"
                  value={form.estado}
                  onChange={/* Ejecuta setForm((current) => ({ ...current, estado: e.target.value })) al invocarse este callback. */ (e) =>
                    setForm(/* Calcula el nuevo valor de Form devolviendo ({ ...current, estado: e.target.value }). */ (current) => ({ ...current, estado: e.target.value }))
                  }
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="productos-form-actions">
              <button
                className="btn btn-primary productos-save"
                onClick={saveProduct}
              >
                <Ico p={I.check} size={14} /> Guardar
              </button>
              <button className="btn btn-ghost" onClick={closeModal}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingProduct && (
        <div className="modal-backdrop">
          <div
            className="modal productos-delete-modal"
            onClick={/* Ejecuta event.stopPropagation() al invocarse este callback. */ (event) => event.stopPropagation()}
          >
            <div className="productos-delete-header">
              <h2 className="productos-delete-title">Eliminar producto</h2>
            </div>
            <p className="productos-delete-text">
              ¿Deseas eliminar {deletingProduct.nombre} del catálogo?
            </p>
            <div className="productos-delete-actions">
              <button
                className="btn btn-danger productos-delete-confirm"
                onClick={/* Solicita eliminar el producto seleccionado y cierra la confirmación al completarse. */ async () => {
                  try {
                    await onDelete(deletingProduct)
                    setDeletingProduct(null)
                  } catch (deleteError) {
                    setError(
                      deleteError instanceof Error
                        ? deleteError.message
                        : "No se pudo eliminar el producto",
                    )
                  }
                }}
              >
                Eliminar
              </button>
              <button
                className="btn btn-ghost"
                onClick={/* Ejecuta setDeletingProduct(null) al invocarse este callback. */ () => setDeletingProduct(null)}
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