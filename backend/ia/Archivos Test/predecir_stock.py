from pathlib import Path

import joblib
import pandas as pd


# ==========================================================
# CONFIGURACIÓN
# ==========================================================

RUTA_MODELO = Path(__file__).resolve().parent / "modelo_stock.pkl"

# Exigimos una ventana completa de 90 días de historial confiable.
MIN_DIAS_HISTORIAL = 90

# Deben coincidir exactamente con el orden de entrenamiento.
VARIABLES_MODELO = [
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d"
]


# ==========================================================
# CARGA DEL MODELO
# ==========================================================

def cargar_modelo():
    """
    Carga el modelo Random Forest previamente entrenado.
    """

    if not RUTA_MODELO.exists():
        raise FileNotFoundError(
            f"No se encontró el modelo entrenado: {RUTA_MODELO}"
        )

    return joblib.load(RUTA_MODELO)


# ==========================================================
# PREDICCIÓN DE REPOSICIÓN
# ==========================================================

def predecir_stock(
    stock_actual,
    stock_minimo,
    ventas_promedio_90d,
    dias_historial_disponible
):
    """
    Estima los días hasta agotar el inventario.

    Parámetros:
        stock_actual: litros disponibles actualmente.
        stock_minimo: mínimo de litros establecido para el producto.
        ventas_promedio_90d: promedio diario de ventas de los últimos 90 días.
        dias_historial_disponible: días de historial confiable disponibles,
                                   dentro de la ventana de 90 días.

    Retorna:
        Diccionario con el resultado de la predicción o el motivo
        por el cual no fue posible realizarla.
    """

    # ------------------------------------------------------
    # 1. VALIDAR LOS DATOS DE ENTRADA
    # ------------------------------------------------------

    valores = {
        "stock_actual": stock_actual,
        "stock_minimo": stock_minimo,
        "ventas_promedio_90d": ventas_promedio_90d,
        "dias_historial_disponible": dias_historial_disponible
    }

    for nombre, valor in valores.items():

        if valor is None:
            return {
                "prediccion_disponible": False,
                "mensaje": f"No se recibió el valor de {nombre}."
            }

        try:
            valores[nombre] = float(valor)
        except (TypeError, ValueError):
            return {
                "prediccion_disponible": False,
                "mensaje": f"El valor de {nombre} no es numérico."
            }

        if not pd.notna(valores[nombre]):
            return {
                "prediccion_disponible": False,
                "mensaje": f"El valor de {nombre} no es válido."
            }

    stock_actual = valores["stock_actual"]
    stock_minimo = valores["stock_minimo"]
    ventas_promedio_90d = valores["ventas_promedio_90d"]
    dias_historial_disponible = valores["dias_historial_disponible"]

    if stock_actual < 0 or stock_minimo < 0:
        return {
            "prediccion_disponible": False,
            "mensaje": "El stock no puede tener valores negativos."
        }

    if ventas_promedio_90d < 0:
        return {
            "prediccion_disponible": False,
            "mensaje": "El promedio de ventas no puede ser negativo."
        }

    if dias_historial_disponible < 0:
        return {
            "prediccion_disponible": False,
            "mensaje": "Los días de historial no pueden ser negativos."
        }

    # Si no hay stock, no necesitamos el modelo ni el historial.
    if stock_actual == 0:
        return {
            "prediccion_disponible": True,
            "dias_hasta_agotar_stock": 0,
            "estado_reposicion": "REPOSICION_INMEDIATA",
            "mensaje": "El producto no tiene stock disponible."
        }

    # ------------------------------------------------------
    # 2. COMPROBAR SI EXISTE HISTORIAL SUFICIENTE
    # ------------------------------------------------------

    if dias_historial_disponible < MIN_DIAS_HISTORIAL:
        return {
            "prediccion_disponible": False,
            "mensaje": (
                "No existe suficiente historial de ventas confiable. "
                f"Se requieren al menos {MIN_DIAS_HISTORIAL} días."
            )
        }

    # ------------------------------------------------------
    # 3. COMPROBAR SI EXISTE DEMANDA
    # ------------------------------------------------------

    if ventas_promedio_90d == 0:

        if stock_actual == 0:
            mensaje = "El inventario está agotado."
        else:
            mensaje = (
                "No se registraron ventas durante el período analizado. "
                "No es posible estimar responsablemente los días hasta "
                "agotar el stock."
            )

        return {
            "prediccion_disponible": False,
            "mensaje": mensaje
        }

    # ------------------------------------------------------
    # 4. COMPROBAR SI EL INVENTARIO ESTÁ AGOTADO
    # ------------------------------------------------------

    if stock_actual == 0:
        return {
            "prediccion_disponible": True,
            "dias_hasta_agotar_stock": 0,
            "estado_reposicion": "REPOSICION_INMEDIATA",
            "mensaje": "El producto no tiene stock disponible."
        }

    # ------------------------------------------------------
    # 5. CARGAR EL MODELO Y GENERAR LA PREDICCIÓN
    # ------------------------------------------------------

    modelo = cargar_modelo()

    datos_producto = pd.DataFrame([{
        "stock_actual": stock_actual,
        "stock_minimo": stock_minimo,
        "ventas_promedio_90d": ventas_promedio_90d
    }], columns=VARIABLES_MODELO)

    prediccion = float(modelo.predict(datos_producto)[0])

    # Evitar que una predicción de regresión sea negativa.
    prediccion = max(0.0, prediccion)

    # ------------------------------------------------------
    # 6. DETERMINAR EL ESTADO DE REPOSICIÓN
    # ------------------------------------------------------

    if stock_actual <= stock_minimo:
        estado_reposicion = "REPOSICION_INMEDIATA"
        mensaje = (
            "El stock actual alcanzó o está por debajo del mínimo "
            "establecido. Se recomienda gestionar la reposición."
        )
    else:
        estado_reposicion = "STOCK_DENTRO_DEL_MINIMO"
        mensaje = (
            "El stock está por encima del mínimo establecido. "
            "Se recomienda monitorear su evolución."
        )

    # ------------------------------------------------------
    # 7. DEVOLVER RESULTADO
    # ------------------------------------------------------

    return {
        "prediccion_disponible": True,
        "dias_hasta_agotar_stock": round(prediccion, 1),
        "estado_reposicion": estado_reposicion,
        "mensaje": mensaje
    }


# ==========================================================
# PRUEBA INDEPENDIENTE
# ==========================================================


if __name__ == "__main__":

    resultado = predecir_stock(
        stock_actual=1200,
        stock_minimo=600,
        ventas_promedio_90d=15.5,
        dias_historial_disponible=90
    )

    print("\n========== PREDICCIÓN DE STOCK ==========")

    for clave, valor in resultado.items():
        print(f"{clave}: {valor}")

    ''' 
    pruebas = {
        "Producto con historial suficiente": {
            "stock_actual": 1200,
            "stock_minimo": 600,
            "ventas_promedio_90d": 15.5,
            "dias_historial_disponible": 90
        },

        "Producto sin historial suficiente": {
            "stock_actual": 1200,
            "stock_minimo": 600,
            "ventas_promedio_90d": 15.5,
            "dias_historial_disponible": 45
        },

        "Producto sin ventas registradas": {
            "stock_actual": 1200,
            "stock_minimo": 600,
            "ventas_promedio_90d": 0,
            "dias_historial_disponible": 90
        },

        "Producto sin stock": {
            "stock_actual": 0,
            "stock_minimo": 600,
            "ventas_promedio_90d": 0,
            "dias_historial_disponible": 0
        },

        "Producto bajo el stock mínimo": {
            "stock_actual": 450,
            "stock_minimo": 600,
            "ventas_promedio_90d": 15,
            "dias_historial_disponible": 90
        }
    }

    for nombre, datos in pruebas.items():

        print(f"\n========== {nombre} ==========")

        resultado = predecir_stock(**datos)

        for clave, valor in resultado.items():
            print(f"{clave}: {valor}")
    '''    
    
  



