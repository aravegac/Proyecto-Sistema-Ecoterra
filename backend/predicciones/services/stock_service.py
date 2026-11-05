from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum, Min
from django.utils import timezone

from inventario.models import Producto, Inventario
from facturacion.models import Factura, DetalleFactura

from predicciones.ml.predecir_stock import predecir_stock


# ==========================================================
# CONFIGURACIÓN
# ==========================================================

DIAS_ANALISIS = 90

# Fecha desde la que asumimos que el historial de ventas
# es completo para nuestro escenario de pruebas.
FECHA_INICIO_HISTORIAL = date(2026, 8, 1)

ESTADOS_FACTURA_VALIDOS = [
    "PAGADA",
    "EMITIDA",
]

CODIGOS_PRODUCTOS_COMERCIALES = [
    "POL-001",
    "POL-002",
    "POL-003",
    "POL-004",
    "POL-005",
    "POL-008",
    "POL-009",
]

ESTADO_INVENTARIO_DISPONIBLE = "Disponible"


# ==========================================================
# CÁLCULO DEL HISTORIAL DISPONIBLE
# ==========================================================

def obtener_dias_historial_disponible(fecha_actual):
    """
    Calcula los días de historial confiable disponibles
    dentro de la ventana de análisis de 90 días.

    Para el escenario de pruebas, se considera que el
    registro de ventas es completo desde la fecha
    FECHA_INICIO_HISTORIAL.
    """

    fecha_inicio_ventana = fecha_actual - timedelta(
        days=DIAS_ANALISIS - 1
    )

    fecha_inicio_confiable = max(
        FECHA_INICIO_HISTORIAL,
        fecha_inicio_ventana,
    )

    dias_disponibles = (
        fecha_actual - fecha_inicio_confiable
    ).days + 1

    return max(0, min(DIAS_ANALISIS, dias_disponibles))


# ==========================================================
# OBTENER STOCK ACTUAL
# ==========================================================

def obtener_stock_actual(producto, fecha_actual):
    """
    Suma las cantidades de los lotes disponibles y no vencidos
    correspondientes a un producto.

    Excluye lotes reservados, vencidos y otros estados.
    """

    resultado = Inventario.objects.filter(
        id_producto=producto.id,
        estado=ESTADO_INVENTARIO_DISPONIBLE,
        fecha_vencimiento__gt=fecha_actual,
    ).aggregate(
        stock_total=Sum("cantidad")
    )

    return resultado["stock_total"] or Decimal("0")


# ==========================================================
# OBTENER VENTAS DE LOS ÚLTIMOS 90 DÍAS
# ==========================================================

def obtener_ventas_promedio_90d(producto, fecha_inicio, fecha_actual):
    """
    Obtiene las unidades vendidas de un producto durante
    los últimos 90 días.

    Solo considera facturas PAGADA y EMITIDA.
    Los días sin ventas se consideran días con demanda cero.
    """

    resultado = DetalleFactura.objects.filter(
        id_producto=producto,
        id_factura__estado__in=ESTADOS_FACTURA_VALIDOS,
        id_factura__fecha_emision__range=(
            fecha_inicio,
            fecha_actual,
        ),
    ).aggregate(
        ventas_totales=Sum("cantidad")
    )

    ventas_totales = resultado["ventas_totales"] or Decimal("0")

    return float(ventas_totales) / DIAS_ANALISIS


# ==========================================================
# GENERAR PREDICCIONES DE TODOS LOS PRODUCTOS
# ==========================================================

def obtener_predicciones_stock():
    """
    Consulta los productos activos, calcula su stock y demanda,
    y ejecuta el modelo de predicción para cada producto.

    Retorna una lista con los datos del producto y el resultado
    de su predicción.
    """

    fecha_actual = timezone.localdate()

    fecha_inicio = fecha_actual - timedelta(
        days=DIAS_ANALISIS - 1
    )

    dias_historial = obtener_dias_historial_disponible(
        fecha_actual
    )

    productos = Producto.objects.filter(
        estado=True,
        codigo__in=CODIGOS_PRODUCTOS_COMERCIALES,
    ).order_by("id")

    resultados = []

    for producto in productos:

        stock_actual = obtener_stock_actual(
            producto,
            fecha_actual,
        )

        # --------------------------------------------------
        # Validar stock mínimo
        # --------------------------------------------------

        if producto.stock_minimo is None:

            resultado = {
                "prediccion_disponible": False,
                "mensaje": (
                    "El producto no tiene un stock mínimo "
                    "configurado."
                ),
            }

            stock_minimo = None

            ventas_promedio = obtener_ventas_promedio_90d(
                producto,
                fecha_inicio,
                fecha_actual,
            )

        else:

            stock_minimo = float(producto.stock_minimo)

            ventas_promedio = obtener_ventas_promedio_90d(
                producto,
                fecha_inicio,
                fecha_actual,
            )

            # ----------------------------------------------
            # Ejecutar predictor
            # ----------------------------------------------

            resultado = predecir_stock(
                stock_actual=float(stock_actual),
                stock_minimo=stock_minimo,
                ventas_promedio_90d=ventas_promedio,
                dias_historial_disponible=dias_historial,
            )

        # --------------------------------------------------
        # Determinar si el producto requiere reposición
        # --------------------------------------------------

        if not resultado.get("prediccion_disponible", False):
            requiere_reposicion = None

        else:
            requiere_reposicion = (
                resultado.get("estado_reposicion")
                == "REPOSICION_INMEDIATA"
            )

        # --------------------------------------------------
        # Construir resultado del producto
        # --------------------------------------------------

        resultados.append({
            "id_producto": producto.id,
            "codigo_producto": producto.codigo,
            "nombre_producto": producto.nombre,
            "stock_actual": float(stock_actual),
            "stock_minimo": stock_minimo,
            "ventas_promedio_90d": round(ventas_promedio, 2),
            "dias_historial_disponible": dias_historial,
            "requiere_reposicion": requiere_reposicion,
            **resultado,
        })

    return resultados