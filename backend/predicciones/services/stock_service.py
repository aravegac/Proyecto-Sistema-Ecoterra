from datetime import date, timedelta
from decimal import Decimal
import math

from django.db.models import Sum
from django.utils import timezone

from inventario.models import Producto, Inventario
from facturacion.models import Factura, DetalleFactura

from predicciones.ml.predecir_stock import predecir_stock, predecir_stock_lote


# ==========================================================
# CONFIGURACIÓN
# ==========================================================

DIAS_ANALISIS = 90

# Fecha desde la que asumimos que el historial de ventas
# es completo para nuestro escenario de pruebas.

# VALOR DE PRUEBA
# FECHA_INICIO_HISTORIAL = date(2026, 10, 1)

# VALOR "REAL"
FECHA_INICIO_HISTORIAL = date(2026, 8, 1)

ESTADOS_FACTURA_VALIDOS = [
    "PAGADA",
    "EMITIDA",
]

ESTADO_INVENTARIO_DISPONIBLE = "Disponible"


# ==========================================================
# RESPUESTA ESTÁNDAR DE ADVERTENCIAS
# ==========================================================

def obtener_campos_advertencia():
    """
    Retorna los campos de advertencia predeterminados.

    Se utilizan cuando no se ejecuta el modelo o cuando
    el predictor no entrega información de advertencias.
    """

    return {
        "advertencia_modelo": False,
        "tipo_advertencia": None,
        "variables_fuera_rango": [],
        "variables_atipicas": [],
        "mensaje_advertencia": None,
    }


def normalizar_resultado_predictor(resultado):
    """
    Garantiza que el resultado del predictor tenga una
    estructura uniforme.

    También reemplaza el antiguo estado de reposición
    por el nombre actualizado.
    """

    resultado = resultado.copy()

    # Completar campos de advertencia faltantes.
    for campo, valor in obtener_campos_advertencia().items():
        resultado.setdefault(campo, valor)

    # Compatibilidad con el nombre anterior del estado.
    if resultado.get("estado_reposicion") == "STOCK_DENTRO_DEL_MINIMO":
        resultado["estado_reposicion"] = "STOCK_SOBRE_MINIMO"

    return resultado


# ==========================================================
# CÁLCULO DEL HISTORIAL DISPONIBLE
# ==========================================================

def obtener_dias_historial_disponible(fecha_actual):
    """
    Calcula los días de historial confiable disponibles
    dentro de la ventana de análisis de 90 días.
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

    return max(
        0,
        min(DIAS_ANALISIS, dias_disponibles),
    )


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
# OBTENER VENTAS DIARIAS DE LOS ÚLTIMOS 90 DÍAS
# ==========================================================

def obtener_ventas_diarias_90d(
    producto,
    fecha_inicio,
    fecha_actual,
):
    """
    Obtiene las ventas diarias de un producto durante
    el período analizado.

    Solo considera facturas PAGADA y EMITIDA.

    Los días sin ventas se completan con cero.
    """

    resultados = DetalleFactura.objects.filter(
        id_producto=producto,
        id_factura__estado__in=ESTADOS_FACTURA_VALIDOS,
        id_factura__fecha_emision__range=(
            fecha_inicio,
            fecha_actual,
        ),
    ).values(
        "id_factura__fecha_emision"
    ).annotate(
        ventas_dia=Sum("cantidad")
    )

    # Diccionario con las ventas agrupadas por fecha.
    ventas_por_fecha = {}

    for registro in resultados:
        fecha = registro["id_factura__fecha_emision"]
        cantidad = registro["ventas_dia"] or Decimal("0")

        ventas_por_fecha[fecha] = float(cantidad)

    # Completar todos los días del período.
    # Los días sin ventas tienen demanda cero.
    ventas_diarias = []

    fecha = fecha_inicio

    while fecha <= fecha_actual:
        ventas_diarias.append(
            ventas_por_fecha.get(fecha, 0.0)
        )

        fecha += timedelta(days=1)

    return ventas_diarias


# ==========================================================
# CALCULAR VARIABLES HISTÓRICAS DE VENTAS
# ==========================================================

def calcular_variables_demanda(ventas_diarias):
    """
    Calcula las variables históricas utilizadas durante
    el entrenamiento del Random Forest ampliado.

    El orden de las ventas diarias es cronológico:
    desde el día más antiguo hasta el más reciente.
    """

    if len(ventas_diarias) != DIAS_ANALISIS:
        raise ValueError(
            "Se requieren exactamente 90 días de ventas "
            "para calcular las variables del modelo."
        )

    historial_90 = ventas_diarias

    historial_60 = historial_90[-60:]
    historial_30 = historial_90[-30:]
    historial_15 = historial_90[-15:]

    historial_anterior_60 = historial_90[:60]
    historial_anterior_15 = historial_90[-30:-15]

    # ------------------------------------------------------
    # PROMEDIOS
    # ------------------------------------------------------

    promedio_90 = sum(historial_90) / 90
    promedio_60 = sum(historial_60) / 60
    promedio_30 = sum(historial_30) / 30
    promedio_15 = sum(historial_15) / 15

    promedio_15_anterior = (
        sum(historial_anterior_15) / 15
    )

    promedio_60_anterior = (
        sum(historial_anterior_60) / 60
    )

    # ------------------------------------------------------
    # DESVIACIÓN ESTÁNDAR POBLACIONAL
    # ------------------------------------------------------

    desviacion_90 = math.sqrt(
        sum(
            (venta - promedio_90) ** 2
            for venta in historial_90
        ) / 90
    )

    # ------------------------------------------------------
    # TENDENCIAS Y VARIACIONES
    # ------------------------------------------------------

    tendencia_90 = (
        promedio_30 / promedio_60_anterior - 1
        if promedio_60_anterior > 0
        else 0.0
    )

    tendencia_30 = (
        promedio_15 / promedio_15_anterior - 1
        if promedio_15_anterior > 0
        else 0.0
    )

    variacion_30_90 = (
        promedio_30 / promedio_90 - 1
        if promedio_90 > 0
        else 0.0
    )

    # Mantener los mismos límites del generador.
    tendencia_90 = max(
        -5.0,
        min(5.0, tendencia_90),
    )

    tendencia_30 = max(
        -5.0,
        min(5.0, tendencia_30),
    )

    variacion_30_90 = max(
        -5.0,
        min(5.0, variacion_30_90),
    )

    # ------------------------------------------------------
    # COMPORTAMIENTO DE VENTAS
    # ------------------------------------------------------

    ventas_maximas = max(historial_90)

    dias_con_ventas = sum(
        1 for venta in historial_90 if venta > 0
    )

    posiciones_ventas = [
        indice
        for indice, venta in enumerate(historial_90)
        if venta > 0
    ]

    if posiciones_ventas:
        dias_desde_ultima_venta = (
            len(historial_90)
            - 1
            - posiciones_ventas[-1]
        )
    else:
        dias_desde_ultima_venta = 90

    return {
        "ventas_promedio_90d": promedio_90,
        "ventas_promedio_60d": promedio_60,
        "ventas_promedio_30d": promedio_30,
        "desviacion_ventas_90d": desviacion_90,
        "tendencia_ventas_90d_pct": tendencia_90,
        "tendencia_ventas_30d_pct": tendencia_30,
        "variacion_30d_90d": variacion_30_90,
        "ventas_maximas_90d": ventas_maximas,
        "dias_con_ventas_90d": dias_con_ventas,
        "dias_desde_ultima_venta": dias_desde_ultima_venta,
    }


# ==========================================================
# GENERAR PREDICCIONES DE TODOS LOS PRODUCTOS
# ==========================================================

def obtener_stock_actual_por_producto(ids_productos, fecha_actual):
    """
    Igual que obtener_stock_actual, pero para todos los productos
    en una sola consulta. Retorna {id_producto: stock}.
    """

    filas = Inventario.objects.filter(
        id_producto__in=ids_productos,
        estado=ESTADO_INVENTARIO_DISPONIBLE,
        fecha_vencimiento__gt=fecha_actual,
    ).values("id_producto").annotate(
        stock_total=Sum("cantidad")
    )

    return {
        fila["id_producto"]: fila["stock_total"] or Decimal("0")
        for fila in filas
    }


def obtener_ventas_diarias_por_producto(
    ids_productos,
    fecha_inicio,
    fecha_actual,
):
    """
    Igual que obtener_ventas_diarias_90d, pero para todos los
    productos en una sola consulta.

    Retorna {id_producto: [ventas día a día]} en orden cronológico.
    Los productos sin ventas no aparecen (equivale a todo cero).
    """

    filas = DetalleFactura.objects.filter(
        id_producto__in=ids_productos,
        id_factura__estado__in=ESTADOS_FACTURA_VALIDOS,
        id_factura__fecha_emision__range=(
            fecha_inicio,
            fecha_actual,
        ),
    ).values(
        "id_producto",
        "id_factura__fecha_emision",
    ).annotate(
        ventas_dia=Sum("cantidad")
    )

    total_dias = (fecha_actual - fecha_inicio).days + 1
    ventas = {}

    for fila in filas:
        indice = (fila["id_factura__fecha_emision"] - fecha_inicio).days

        if not 0 <= indice < total_dias:
            continue

        serie = ventas.setdefault(
            fila["id_producto"], [0.0] * total_dias
        )
        serie[indice] = float(fila["ventas_dia"] or Decimal("0"))

    return ventas


def obtener_predicciones_stock():
    """
    Consulta los productos activos, calcula su stock,
    obtiene el historial de ventas y ejecuta el modelo.

    Retorna una lista con los datos del producto y
    el resultado de su predicción.

    Rendimiento: el stock y las ventas se obtienen con una
    consulta cada uno para todos los productos, y el modelo
    se ejecuta una sola vez para todo el lote.
    """

    fecha_actual = timezone.localdate()

    fecha_inicio = fecha_actual - timedelta(
        days=DIAS_ANALISIS - 1
    )

    dias_historial = obtener_dias_historial_disponible(
        fecha_actual
    )

    productos = list(
        Producto.objects.filter(
            estado=True,
        ).order_by("id").only(
            "id", "codigo", "nombre", "stock_minimo",
        )
    )

    ids_productos = [producto.id for producto in productos]

    stock_por_producto = obtener_stock_actual_por_producto(
        ids_productos,
        fecha_actual,
    )

    # Las ventas solo se necesitan si hay historial suficiente.
    ventas_por_producto = (
        obtener_ventas_diarias_por_producto(
            ids_productos,
            fecha_inicio,
            fecha_actual,
        )
        if dias_historial >= DIAS_ANALISIS
        else {}
    )

    ventas_sin_movimiento = [0.0] * DIAS_ANALISIS

    resultados = []

    # Productos que pasan por el modelo: (posición, entrada, extra).
    pendientes = []

    for producto in productos:

        # --------------------------------------------------
        # 1. OBTENER STOCK ACTUAL
        # --------------------------------------------------

        stock_actual = stock_por_producto.get(
            producto.id, Decimal("0")
        )

        # --------------------------------------------------
        # 2. VALIDAR STOCK MÍNIMO
        # --------------------------------------------------

        if producto.stock_minimo is None:

            resultados.append({
                "id_producto": producto.id,
                "codigo_producto": producto.codigo,
                "nombre_producto": producto.nombre,
                "stock_actual": float(stock_actual),
                "stock_minimo": None,
                "ventas_promedio_90d": None,
                "dias_historial_disponible": dias_historial,
                "requiere_reposicion": None,
                "prediccion_disponible": False,
                **obtener_campos_advertencia(),
                "mensaje": (
                    "El producto no tiene un stock mínimo "
                    "configurado."
                ),
            })

            continue

        stock_minimo = float(producto.stock_minimo)

        # --------------------------------------------------
        # 3. VALIDAR STOCK AGOTADO
        # --------------------------------------------------

        # El stock cero se valida antes del historial.
        # No se necesita ejecutar el modelo para determinar
        # que un producto sin stock requiere reposición.

        if stock_actual <= 0:

            resultados.append(None)
            pendientes.append((
                len(resultados) - 1,
                {
                    "stock_actual": 0,
                    "stock_minimo": stock_minimo,
                    "ventas_promedio_90d": 0,
                    "cobertura_stock_dias": 0,
                    "desviacion_ventas_90d": 0,
                    "tendencia_ventas_90d_pct": 0,
                    "ventas_maximas_90d": 0,
                    "dias_con_ventas_90d": 0,
                    "ventas_promedio_30d": 0,
                    "ventas_promedio_60d": 0,
                    "variacion_30d_90d": 0,
                    "dias_desde_ultima_venta": 90,
                    "tendencia_ventas_30d_pct": 0,
                    "dias_historial_disponible": dias_historial,
                },
                {
                    "agotado": True,
                    "base": {
                        "id_producto": producto.id,
                        "codigo_producto": producto.codigo,
                        "nombre_producto": producto.nombre,
                        "stock_actual": 0,
                        "stock_minimo": stock_minimo,
                        "ventas_promedio_90d": None,
                        "dias_historial_disponible": dias_historial,
                    },
                },
            ))

            continue

        # --------------------------------------------------
        # 4. VALIDAR HISTORIAL DISPONIBLE
        # --------------------------------------------------

        if dias_historial < DIAS_ANALISIS:

            resultados.append({
                "id_producto": producto.id,
                "codigo_producto": producto.codigo,
                "nombre_producto": producto.nombre,
                "stock_actual": float(stock_actual),
                "stock_minimo": stock_minimo,
                "ventas_promedio_90d": None,
                "dias_historial_disponible": dias_historial,
                "requiere_reposicion": None,
                "prediccion_disponible": False,
                **obtener_campos_advertencia(),
                "mensaje": (
                    "No existe suficiente historial de ventas "
                    "confiable. Se requieren 90 días completos."
                ),
            })

            continue

        # --------------------------------------------------
        # 5. OBTENER HISTORIAL DE VENTAS
        # --------------------------------------------------

        ventas_diarias = ventas_por_producto.get(
            producto.id, ventas_sin_movimiento
        )

        variables_demanda = calcular_variables_demanda(
            ventas_diarias
        )

        # --------------------------------------------------
        # 6. CALCULAR COBERTURA DE STOCK
        # --------------------------------------------------

        ventas_promedio_90d = (
            variables_demanda["ventas_promedio_90d"]
        )

        cobertura_stock_dias = (
            float(stock_actual) / ventas_promedio_90d
            if ventas_promedio_90d > 0
            else 0.0
        )

        resultados.append(None)
        pendientes.append((
            len(resultados) - 1,
            {
                "stock_actual": float(stock_actual),
                "stock_minimo": stock_minimo,
                "ventas_promedio_90d": ventas_promedio_90d,
                "cobertura_stock_dias": cobertura_stock_dias,
                "desviacion_ventas_90d": variables_demanda["desviacion_ventas_90d"],
                "tendencia_ventas_90d_pct": variables_demanda["tendencia_ventas_90d_pct"],
                "ventas_maximas_90d": variables_demanda["ventas_maximas_90d"],
                "dias_con_ventas_90d": variables_demanda["dias_con_ventas_90d"],
                "ventas_promedio_30d": variables_demanda["ventas_promedio_30d"],
                "ventas_promedio_60d": variables_demanda["ventas_promedio_60d"],
                "variacion_30d_90d": variables_demanda["variacion_30d_90d"],
                "dias_desde_ultima_venta": variables_demanda["dias_desde_ultima_venta"],
                "tendencia_ventas_30d_pct": variables_demanda["tendencia_ventas_30d_pct"],
                "dias_historial_disponible": dias_historial,
            },
            {
                "agotado": False,
                "base": {
                    "id_producto": producto.id,
                    "codigo_producto": producto.codigo,
                    "nombre_producto": producto.nombre,
                    "stock_actual": float(stock_actual),
                    "stock_minimo": stock_minimo,
                    "ventas_promedio_90d": round(ventas_promedio_90d, 2),
                    "ventas_promedio_60d": round(
                        variables_demanda["ventas_promedio_60d"], 2
                    ),
                    "ventas_promedio_30d": round(
                        variables_demanda["ventas_promedio_30d"], 2
                    ),
                    "cobertura_stock_dias": round(cobertura_stock_dias, 2),
                    "dias_historial_disponible": dias_historial,
                },
            },
        ))

    # ------------------------------------------------------
    # 7. EJECUTAR PREDICTOR (UNA SOLA VEZ PARA TODO EL LOTE)
    # ------------------------------------------------------

    predicciones = predecir_stock_lote(
        [entrada for _, entrada, _ in pendientes]
    )

    for (posicion, _, extra), resultado in zip(pendientes, predicciones):

        resultado = normalizar_resultado_predictor(resultado)

        # --------------------------------------------------
        # 8. DETERMINAR SI REQUIERE REPOSICIÓN
        # --------------------------------------------------

        if extra["agotado"]:
            requiere_reposicion = True
        elif not resultado.get("prediccion_disponible", False):
            requiere_reposicion = None
        else:
            requiere_reposicion = (
                resultado.get("estado_reposicion")
                == "REPOSICION_INMEDIATA"
            )

        # --------------------------------------------------
        # 9. CONSTRUIR RESULTADO DEL PRODUCTO
        # --------------------------------------------------

        resultados[posicion] = {
            **extra["base"],
            **resultado,
            "requiere_reposicion": requiere_reposicion,
        }

    return resultados
