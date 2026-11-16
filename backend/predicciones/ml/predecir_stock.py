from pathlib import Path

import joblib
import pandas as pd
import numpy as np
import json
import threading


# ==========================================================
# CONFIGURACIÓN
# ==========================================================

RUTA_MODELO = (
    Path(__file__).resolve().parent
    / "modelos"
    / "modelo_stock.pkl"
)

RUTA_RANGOS = (
    Path(__file__).resolve().parent
    / "modelos"
    / "rangos_variables_stock.json"
)

VARIABLES_CLAVE_OOD = [
    "cobertura_stock_dias",
    "stock_actual",
    "ventas_promedio_90d",
    "desviacion_ventas_90d",
    # Frecuencia de venta: es donde más se diferencian los
    # productos reales de los usados en el entrenamiento.
    "dias_con_ventas_90d",
    "dias_desde_ultima_venta",
]

MIN_DIAS_HISTORIAL = 90

# Deben coincidir exactamente con las variables
# y el orden utilizados durante el entrenamiento.

VARIABLES_MODELO = [
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d",
    "cobertura_stock_dias",
    "desviacion_ventas_90d",
    "tendencia_ventas_90d_pct",
    "ventas_maximas_90d",
    "dias_con_ventas_90d",
    "ventas_promedio_30d",
    "ventas_promedio_60d",
    "variacion_30d_90d",
    "dias_desde_ultima_venta",
    "tendencia_ventas_30d_pct",
]

VARIABLES_NO_NEGATIVAS = [
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d",
    "cobertura_stock_dias",
    "desviacion_ventas_90d",
    "ventas_maximas_90d",
    "dias_con_ventas_90d",
    "ventas_promedio_30d",
    "ventas_promedio_60d",
    "dias_desde_ultima_venta",
]


# ==========================================================
# CARGA DEL MODELO
# ==========================================================

_modelo_cache = None
_modelo_lock = threading.Lock()

def cargar_modelo():
    """
    Carga el modelo una sola vez por proceso.

    El archivo pesa ~40 MB y tarda varios segundos en leerse,
    por eso se guarda en memoria. El lock evita que dos
    peticiones simultáneas lo carguen dos veces.
    """
    global _modelo_cache

    if _modelo_cache is None:
        with _modelo_lock:
            if _modelo_cache is None:
                if not RUTA_MODELO.exists():
                    raise FileNotFoundError(
                        f"No se encontró el modelo entrenado: {RUTA_MODELO}"
                    )

                _modelo_cache = joblib.load(RUTA_MODELO)

    return _modelo_cache

_rangos_cache = None

def cargar_rangos():
    """
    Carga los rangos calculados durante el entrenamiento.

    Mantiene los rangos en memoria para evitar leer
    repetidamente el archivo JSON.
    """

    global _rangos_cache

    if _rangos_cache is None:

        if not RUTA_RANGOS.exists():
            raise FileNotFoundError(
                f"No se encontró el archivo de rangos: {RUTA_RANGOS}"
            )

        with open(RUTA_RANGOS, "r", encoding="utf-8") as archivo:
            _rangos_cache = json.load(archivo)

    return _rangos_cache

def validar_rangos(rangos):
    """
    Comprueba que existan los rangos necesarios
    para evaluar las variables clave.
    """

    for variable in VARIABLES_CLAVE_OOD:

        if variable not in rangos:
            raise ValueError(
                f"Faltan los rangos de la variable {variable}."
            )

        limites = rangos[variable]

        campos_requeridos = [
            "minimo",
            "maximo",
            "percentil_01",
            "percentil_99",
        ]

        for campo in campos_requeridos:

            if campo not in limites:
                raise ValueError(
                    f"Falta el campo {campo} "
                    f"en los rangos de {variable}."
                )

            if not np.isfinite(float(limites[campo])):
                raise ValueError(
                    f"El campo {campo} de {variable} "
                    "contiene un valor no válido."
                )

        if limites["minimo"] > limites["maximo"]:
            raise ValueError(
                f"Los límites de {variable} son incorrectos."
            )

    return True


_rangos_validados = False

def evaluar_rangos_entrenamiento(valores):
    """
    Compara las variables relevantes del producto con los
    rangos observados durante el entrenamiento.

    Distingue entre valores fuera del rango absoluto y
    valores atípicos según los percentiles 1 y 99.

    Los rangos se cargan y validan una sola vez por proceso.
    """

    global _rangos_validados

    try:

        rangos = cargar_rangos()

        if not _rangos_validados:
            validar_rangos(rangos)
            _rangos_validados = True

    except (
        FileNotFoundError,
        json.JSONDecodeError,
        ValueError,
        TypeError,
    ):
        return {
            "advertencia_modelo": True,
            "tipo_advertencia": "METADATOS_NO_DISPONIBLES",
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": (
                "No fue posible verificar si los datos están "
                "dentro de los rangos del entrenamiento. "
                "Interpreta la estimación con precaución."
            ),
        }

    variables_fuera_rango = []
    variables_atipicas = []

    for variable in VARIABLES_CLAVE_OOD:

        valor = valores[variable]
        limites = rangos[variable]

        minimo = limites["minimo"]
        maximo = limites["maximo"]
        percentil_01 = limites["percentil_01"]
        percentil_99 = limites["percentil_99"]

        if valor < minimo or valor > maximo:

            variables_fuera_rango.append(variable)

        elif valor < percentil_01 or valor > percentil_99:

            variables_atipicas.append(variable)

    if variables_fuera_rango:

        return {
            "advertencia_modelo": True,
            "tipo_advertencia": "FUERA_RANGO_ENTRENAMIENTO",
            "variables_fuera_rango": variables_fuera_rango,
            "variables_atipicas": variables_atipicas,
            "mensaje_advertencia": (
                "Una o más variables están fuera de los rangos "
                "observados durante el entrenamiento. La "
                "estimación debe interpretarse con precaución."
            ),
        }

    if variables_atipicas:

        return {
            "advertencia_modelo": True,
            "tipo_advertencia": "VALORES_ATIPICOS",
            "variables_fuera_rango": [],
            "variables_atipicas": variables_atipicas,
            "mensaje_advertencia": (
                "Una o más variables presentan valores poco "
                "habituales respecto al entrenamiento. "
                "Se recomienda interpretar la estimación "
                "con precaución."
            ),
        }

    return {
        "advertencia_modelo": False,
        "tipo_advertencia": None,
        "variables_fuera_rango": [],
        "variables_atipicas": [],
        "mensaje_advertencia": None,
    }

# ==========================================================
# PREDICCIÓN DE REPOSICIÓN
# ==========================================================

def _validar_valores(valores):
    """
    Valida y normaliza las variables de entrada.

    Retorna (valores, None) si se puede ejecutar el modelo,
    o (None, resultado) cuando la respuesta se conoce sin él.
    """

    valores = dict(valores)

    # ------------------------------------------------------
    # 1. VALIDAR LOS DATOS DE ENTRADA
    # ------------------------------------------------------

    for nombre, valor in valores.items():

        if valor is None:
            return None, {
                "prediccion_disponible": False,
                "mensaje": f"No se recibió el valor de {nombre}.",
            }

        try:
            valor = float(valor)
        except (TypeError, ValueError):
            return None, {
                "prediccion_disponible": False,
                "mensaje": f"El valor de {nombre} no es numérico.",
            }

        if not np.isfinite(valor):
            return None, {
                "prediccion_disponible": False,
                "mensaje": f"El valor de {nombre} no es válido.",
            }

        valores[nombre] = valor

    # Actualizar valores validados.
    stock_actual = valores["stock_actual"]
    stock_minimo = valores["stock_minimo"]
    dias_historial_disponible = valores[
        "dias_historial_disponible"
    ]

    # ------------------------------------------------------
    # 2. VALIDAR VALORES NO NEGATIVOS
    # ------------------------------------------------------

    for nombre in VARIABLES_NO_NEGATIVAS:

        if valores[nombre] < 0:
            return None, {
                "prediccion_disponible": False,
                "mensaje": (
                    f"La variable {nombre} no puede "
                    "tener valores negativos."
                ),
            }

    if valores["dias_con_ventas_90d"] > 90:
        return None, {
            "prediccion_disponible": False,
            "mensaje": (
                "Los días con ventas no pueden superar "
                "los 90 días analizados."
            ),
        }

    if valores["dias_desde_ultima_venta"] > 90:
        return None, {
            "prediccion_disponible": False,
            "mensaje": (
                "Los días desde la última venta no pueden "
                "superar los 90 días analizados."
            ),
        }

    # ------------------------------------------------------
    # 3. COMPROBAR SI EL INVENTARIO ESTÁ AGOTADO
    # ------------------------------------------------------

    if stock_actual == 0:
        return None, {
            "prediccion_disponible": True,
            "dias_hasta_agotar_stock": 0,
            "estado_reposicion": "REPOSICION_INMEDIATA",
            "mensaje": "El producto no tiene stock disponible.",
        }

    # ------------------------------------------------------
    # 4. COMPROBAR HISTORIAL SUFICIENTE
    # ------------------------------------------------------

    if dias_historial_disponible < MIN_DIAS_HISTORIAL:
        return None, {
            "prediccion_disponible": False,
            "mensaje": (
                "No existe suficiente historial de ventas confiable. "
                f"Se requieren al menos {MIN_DIAS_HISTORIAL} días."
            ),
        }

    # ------------------------------------------------------
    # 5. COMPROBAR SI EXISTE DEMANDA
    # ------------------------------------------------------

    if valores["ventas_promedio_90d"] == 0:
        return None, {
            "prediccion_disponible": False,
            "mensaje": (
                "No se registraron ventas durante los últimos "
                "90 días. No es posible estimar responsablemente "
                "los días hasta agotar el stock."
            ),
        }

    return valores, None


def _construir_resultado(valores, prediccion):
    """
    Arma la respuesta final a partir de la predicción del modelo.
    """

    if not np.isfinite(prediccion):
        return {
            "prediccion_disponible": False,
            "mensaje": "El modelo generó una predicción no válida.",
        }

    stock_actual = valores["stock_actual"]
    stock_minimo = valores["stock_minimo"]

    prediccion = max(0.0, prediccion)
    advertencia = evaluar_rangos_entrenamiento(valores)

    # ------------------------------------------------------
    # 8. DETERMINAR EL ESTADO DE REPOSICIÓN
    # ------------------------------------------------------

    if stock_actual <= stock_minimo:

        estado_reposicion = "REPOSICION_INMEDIATA"

        mensaje = (
            "El stock actual alcanzó o está por debajo del "
            "mínimo establecido. Se recomienda gestionar "
            "la reposición."
        )

    else:

        estado_reposicion = "STOCK_SOBRE_MINIMO"

        mensaje = (
            "El stock está por encima del mínimo establecido. "
            "Se recomienda monitorear su evolución."
        )

    # ------------------------------------------------------
    # 9. DEVOLVER RESULTADO
    # ------------------------------------------------------

    return {
        "prediccion_disponible": True,
        "dias_hasta_agotar_stock": round(prediccion, 1),
        "estado_reposicion": estado_reposicion,
        "mensaje": mensaje,
        **advertencia,
    }




def predecir_stock_lote(lista_valores):
    """
    Ejecuta la predicción de varios productos a la vez.

    Recibe una lista de diccionarios con los mismos argumentos
    que predecir_stock y retorna los resultados en el mismo orden.

    El modelo se invoca una sola vez para todo el lote, lo que
    es mucho más rápido que predecir producto por producto.
    """

    resultados = [None] * len(lista_valores)
    pendientes = []

    for indice, entrada in enumerate(lista_valores):
        valores, temprano = _validar_valores(entrada)

        if temprano is not None:
            resultados[indice] = temprano
        else:
            pendientes.append((indice, valores))

    if not pendientes:
        return resultados

    datos = pd.DataFrame(
        [
            [valores[variable] for variable in VARIABLES_MODELO]
            for _, valores in pendientes
        ],
        columns=VARIABLES_MODELO,
    )

    try:
        modelo = cargar_modelo()
        predicciones = modelo.predict(datos)

    except FileNotFoundError as error:
        for indice, _ in pendientes:
            resultados[indice] = {
                "prediccion_disponible": False,
                "mensaje": str(error),
            }
        return resultados

    except Exception as error:
        for indice, _ in pendientes:
            resultados[indice] = {
                "prediccion_disponible": False,
                "mensaje": (
                    "No fue posible ejecutar el modelo de "
                    f"predicción: {str(error)}"
                ),
            }
        return resultados

    for (indice, valores), prediccion in zip(pendientes, predicciones):
        resultados[indice] = _construir_resultado(
            valores, float(prediccion)
        )

    return resultados


def predecir_stock(
    stock_actual,
    stock_minimo,
    ventas_promedio_90d,
    cobertura_stock_dias,
    desviacion_ventas_90d,
    tendencia_ventas_90d_pct,
    ventas_maximas_90d,
    dias_con_ventas_90d,
    ventas_promedio_30d,
    ventas_promedio_60d,
    variacion_30d_90d,
    dias_desde_ultima_venta,
    tendencia_ventas_30d_pct,
    dias_historial_disponible,
):
    """
    Estima los días hasta agotar el inventario de un producto.

    Utiliza las 13 variables del Random Forest ampliado.
    Las tendencias y variaciones pueden ser negativas,
    ya que representan disminuciones de ventas.
    """

    return predecir_stock_lote([{
        "stock_actual": stock_actual,
        "stock_minimo": stock_minimo,
        "ventas_promedio_90d": ventas_promedio_90d,
        "cobertura_stock_dias": cobertura_stock_dias,
        "desviacion_ventas_90d": desviacion_ventas_90d,
        "tendencia_ventas_90d_pct": tendencia_ventas_90d_pct,
        "ventas_maximas_90d": ventas_maximas_90d,
        "dias_con_ventas_90d": dias_con_ventas_90d,
        "ventas_promedio_30d": ventas_promedio_30d,
        "ventas_promedio_60d": ventas_promedio_60d,
        "variacion_30d_90d": variacion_30d_90d,
        "dias_desde_ultima_venta": dias_desde_ultima_venta,
        "tendencia_ventas_30d_pct": tendencia_ventas_30d_pct,
        "dias_historial_disponible": dias_historial_disponible,
    }])[0]


# ==========================================================
# PRUEBA INDEPENDIENTE
# ==========================================================

if __name__ == "__main__":

    resultado = predecir_stock(
        stock_actual=1200,
        stock_minimo=600,
        ventas_promedio_90d=15.5,
        cobertura_stock_dias=1200 / 15.5,
        desviacion_ventas_90d=5.2,
        tendencia_ventas_90d_pct=0.15,
        ventas_maximas_90d=30,
        dias_con_ventas_90d=75,
        ventas_promedio_30d=17.0,
        ventas_promedio_60d=16.2,
        variacion_30d_90d=0.10,
        dias_desde_ultima_venta=0,
        tendencia_ventas_30d_pct=0.12,
        dias_historial_disponible=90,
    )

    print("\n========== PREDICCIÓN DE STOCK ==========")

    for clave, valor in resultado.items():
        print(f"{clave}: {valor}")
