"""
Copia versionada de MODELO3_SeleccionFinal.py (v2).

Cambios v2 respecto a v1: perfiles de venta esporádica y ocasional,
cobertura simulada hasta 600 días (escala log), stock mínimo de
10 a 90 días, horizonte de 730 días, 80 productos y descarte de
filas sin ventas en 90 días.

Uso: ejecutar desde una carpeta de trabajo; luego copiar
modelo_stock_final.pkl -> ml/modelos/modelo_stock.pkl,
rangos_variables_stock.json -> ml/modelos/ y
metricas_modelo_stock.json -> artefactos/.

MODELO 3 - SELECCIÓN FINAL DEL MODELO DE PREDICCIÓN DE STOCK

Ecoterra - Predicción de días hasta agotar stock.

Este script:
1. Genera un dataset sintético con demanda diaria simulada.
2. Calcula variables históricas de 15, 30, 60 y 90 días.
3. Calcula los días futuros hasta agotar el stock.
4. Evalúa cinco alternativas:
   - Referencia matemática.
   - Random Forest de 3 variables.
   - Random Forest de 4 variables.
   - Random Forest ampliado.
   - Modelo híbrido.
5. Realiza evaluación cronológica con purga temporal.
6. Realiza validación GroupKFold por producto.
7. Entrena el Random Forest ampliado con todos los datos.
8. Guarda el modelo y sus metadatos.

IMPORTANTE:
Los datos son sintéticos. Las métricas no representan una
validación con ventas reales de Ecoterra.
"""

from pathlib import Path
import json
import warnings

import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


warnings.filterwarnings("ignore")


# ============================================================
# 1. CONFIGURACIÓN GENERAL
# ============================================================

SEMILLA = 42

CANTIDAD_PRODUCTOS = 80  # más productos para cubrir los perfiles esporádicos
CANTIDAD_SEMANAS = 52

FECHA_INICIO = "2025-11-11"
FECHA_CORTE = pd.Timestamp("2026-08-25")

DIAS_FUTUROS_MAXIMOS = 730  # coberturas reales superan los 365 días

CANTIDAD_FOLDS = 5

DIRECTORIO_SALIDA = Path("resultados_modelo_stock_final")
DIRECTORIO_SALIDA.mkdir(exist_ok=True)

ARCHIVO_DATASET = DIRECTORIO_SALIDA / "dataset_stock_final.csv"
ARCHIVO_MODELO = DIRECTORIO_SALIDA / "modelo_stock_final.pkl"
ARCHIVO_METRICAS = DIRECTORIO_SALIDA / "metricas_modelo_stock.json"
ARCHIVO_RANGOS = (
    DIRECTORIO_SALIDA / "rangos_variables_stock.json"
)
ARCHIVO_IMPORTANCIA = DIRECTORIO_SALIDA / "importancia_variables.csv"

rng = np.random.default_rng(SEMILLA)


# ============================================================
# 2. VARIABLES UTILIZADAS POR LOS MODELOS
# ============================================================

FEATURES_3 = [
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d",
]

FEATURES_4 = FEATURES_3 + [
    "cobertura_stock_dias",
]

FEATURES_AMPLIADAS = [
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

VARIABLE_OBJETIVO = "dias_hasta_agotar_stock"


# ============================================================
# 3. GENERACIÓN DE DEMANDA DIARIA SINTÉTICA
# ============================================================

def generar_demanda_diaria(
    fechas,
    demanda_base,
    tendencia_anual,
    estacionalidad,
    variabilidad,
    probabilidad_venta,
    rng_producto,
):
    """
    Simula ventas diarias para un producto.

    La demanda puede variar por:
    - Tendencia temporal.
    - Estacionalidad.
    - Día de la semana.
    - Variabilidad aleatoria.
    - Intermitencia de ventas.

    La demanda futura se utiliza únicamente para calcular
    la variable objetivo, nunca para calcular las variables
    predictoras históricas.
    """

    fechas = pd.DatetimeIndex(fechas)

    fecha_referencia = pd.Timestamp("2026-05-01")

    dias_desde_referencia = (
        fechas - fecha_referencia
    ).days.to_numpy()

    # Tendencia progresiva de la demanda.
    factor_tendencia = np.exp(
        tendencia_anual * dias_desde_referencia / 365
    )

    # Estacionalidad anual.
    dia_anual = fechas.dayofyear.to_numpy()

    factor_estacional = (
        1
        + estacionalidad
        * np.sin(2 * np.pi * dia_anual / 365)
    )

    # Variación según día de la semana.
    factores_semana = np.array([
        1.00, 1.04, 1.08, 1.10, 1.12, 0.95, 0.82
    ])

    factor_semana = factores_semana[
        fechas.dayofweek.to_numpy()
    ]

    # Ruido aleatorio positivo.
    ruido = rng_producto.lognormal(
        mean=-(variabilidad ** 2) / 2,
        sigma=variabilidad,
        size=len(fechas),
    )

    # Ventas intermitentes.
    ocurre_venta = (
        rng_producto.random(len(fechas))
        < probabilidad_venta
    )

    demanda = (
        demanda_base
        * factor_tendencia
        * factor_estacional
        * factor_semana
        * ruido
    )

    demanda = np.where(ocurre_venta, demanda, 0.0)

    return np.maximum(demanda, 0.0)


# ============================================================
# 4. CÁLCULO DE VARIABLES HISTÓRICAS
# ============================================================

def calcular_variables_historicas(serie, fecha_referencia):
    """
    Calcula las variables usando exclusivamente los días
    anteriores o iguales a la fecha de referencia.

    No utiliza información futura.
    """

    fecha_inicio_90 = fecha_referencia - pd.Timedelta(days=89)
    fecha_inicio_60 = fecha_referencia - pd.Timedelta(days=59)
    fecha_inicio_30 = fecha_referencia - pd.Timedelta(days=29)
    fecha_inicio_15 = fecha_referencia - pd.Timedelta(days=14)

    historial_90 = serie.loc[
        fecha_inicio_90:fecha_referencia
    ].to_numpy()

    historial_60 = serie.loc[
        fecha_inicio_60:fecha_referencia
    ].to_numpy()

    historial_30 = serie.loc[
        fecha_inicio_30:fecha_referencia
    ].to_numpy()

    historial_15 = serie.loc[
        fecha_inicio_15:fecha_referencia
    ].to_numpy()

    historial_anterior_60 = serie.loc[
        fecha_inicio_90:
        fecha_inicio_30 - pd.Timedelta(days=1)
    ].to_numpy()

    historial_anterior_15 = serie.loc[
        fecha_inicio_30:
        fecha_inicio_15 - pd.Timedelta(days=1)
    ].to_numpy()

    promedio_90 = float(np.mean(historial_90))
    promedio_60 = float(np.mean(historial_60))
    promedio_30 = float(np.mean(historial_30))

    promedio_15 = float(np.mean(historial_15))

    promedio_15_anterior = (
        float(np.mean(historial_anterior_15))
        if len(historial_anterior_15) > 0
        else 0.0
    )

    promedio_60_anterior = (
        float(np.mean(historial_anterior_60))
        if len(historial_anterior_60) > 0
        else 0.0
    )

    # Variación entre el promedio de 30 y 90 días.
    variacion_30_90 = (
        promedio_30 / promedio_90 - 1
        if promedio_90 > 0
        else 0.0
    )

    # Tendencia: últimos 30 días frente a los 60 anteriores.
    tendencia_90 = (
        promedio_30 / promedio_60_anterior - 1
        if promedio_60_anterior > 0
        else 0.0
    )

    # Tendencia: últimos 15 días frente a los 15 anteriores.
    tendencia_30 = (
        promedio_15 / promedio_15_anterior - 1
        if promedio_15_anterior > 0
        else 0.0
    )

    # Días desde la última venta.
    dias_con_ventas = int(np.sum(historial_90 > 0))

    posiciones_ventas = np.where(historial_90 > 0)[0]

    if len(posiciones_ventas) > 0:
        dias_desde_ultima_venta = (
            len(historial_90) - 1 - posiciones_ventas[-1]
        )
    else:
        dias_desde_ultima_venta = 90

    return {
        "ventas_promedio_90d": promedio_90,
        "ventas_promedio_60d": promedio_60,
        "ventas_promedio_30d": promedio_30,
        "desviacion_ventas_90d": float(
            np.std(historial_90)
        ),
        "tendencia_ventas_90d_pct": float(
            np.clip(tendencia_90, -5, 5)
        ),
        "tendencia_ventas_30d_pct": float(
            np.clip(tendencia_30, -5, 5)
        ),
        "variacion_30d_90d": float(
            np.clip(variacion_30_90, -5, 5)
        ),
        "ventas_maximas_90d": float(
            np.max(historial_90)
        ),
        "dias_con_ventas_90d": dias_con_ventas,
        "dias_desde_ultima_venta": int(
            dias_desde_ultima_venta
        ),
    }


# ============================================================
# 5. CÁLCULO DE DÍAS HASTA AGOTAR EL STOCK
# ============================================================

def calcular_dias_hasta_agotar_stock(
    stock_actual,
    serie_demanda,
    fecha_referencia,
):
    """
    Calcula cuántos días transcurren hasta que la demanda
    futura acumulada alcanza o supera el stock actual.

    El agotamiento se calcula respecto a stock cero,
    no respecto al stock mínimo.
    """

    demanda_futura = serie_demanda.loc[
        fecha_referencia + pd.Timedelta(days=1):
        fecha_referencia + pd.Timedelta(
            days=DIAS_FUTUROS_MAXIMOS
        )
    ].to_numpy()

    stock_restante = float(stock_actual)

    for dia, demanda in enumerate(demanda_futura, start=1):

        stock_restante -= float(demanda)

        if stock_restante <= 0:
            return dia

    return DIAS_FUTUROS_MAXIMOS


# ============================================================
# 6. GENERACIÓN DEL DATASET
# ============================================================

def generar_dataset():
    print("\n" + "=" * 65)
    print("GENERANDO DATASET SINTÉTICO MEJORADO")
    print("=" * 65)

    fechas_referencia = pd.date_range(
        start=FECHA_INICIO,
        periods=CANTIDAD_SEMANAS,
        freq="7D",
    )

    fecha_inicio_historial = (
        fechas_referencia.min() - pd.Timedelta(days=365)
    )

    fecha_fin_futuro = (
        fechas_referencia.max()
        + pd.Timedelta(days=DIAS_FUTUROS_MAXIMOS)
    )

    fechas_diarias = pd.date_range(
        start=fecha_inicio_historial,
        end=fecha_fin_futuro,
        freq="D",
    )

    registros = []

    perfiles = [
        # Venta B2B por lotes: ~4-5 días con venta cada 90,
        # como se observa hoy en los productos de Ecoterra.
        {
            "nombre": "esporadica",
            "probabilidad": 0.05,
            "variabilidad": 0.90,
        },
        # ~9-11 días con venta cada 90.
        {
            "nombre": "ocasional",
            "probabilidad": 0.12,
            "variabilidad": 0.80,
        },
        {
            "nombre": "muy_baja",
            "probabilidad": 0.35,
            "variabilidad": 0.80,
        },
        {
            "nombre": "baja",
            "probabilidad": 0.55,
            "variabilidad": 0.55,
        },
        {
            "nombre": "moderada",
            "probabilidad": 0.75,
            "variabilidad": 0.40,
        },
        {
            "nombre": "alta",
            "probabilidad": 0.90,
            "variabilidad": 0.30,
        },
        {
            "nombre": "industrial",
            "probabilidad": 0.98,
            "variabilidad": 0.20,
        },
    ]

    for numero_producto in range(1, CANTIDAD_PRODUCTOS + 1):

        rng_producto = np.random.default_rng(
            SEMILLA + numero_producto
        )

        # Los perfiles se asignan aleatoriamente para evitar
        # una asignación determinista por número de producto.
        perfil = perfiles[
            rng_producto.integers(0, len(perfiles))
        ]

        demanda_base = float(
            np.exp(
                rng_producto.uniform(
                    np.log(0.05),
                    np.log(5000),
                )
            )
        )

        tendencia_anual = float(
            rng_producto.uniform(-0.20, 0.35)
        )

        estacionalidad = float(
            rng_producto.uniform(0.0, 0.25)
        )

        serie_demanda = generar_demanda_diaria(
            fechas=fechas_diarias,
            demanda_base=demanda_base,
            tendencia_anual=tendencia_anual,
            estacionalidad=estacionalidad,
            variabilidad=perfil["variabilidad"],
            probabilidad_venta=perfil["probabilidad"],
            rng_producto=rng_producto,
        )

        serie = pd.Series(
            serie_demanda,
            index=fechas_diarias,
        )

        for fecha in fechas_referencia:

            variables = calcular_variables_historicas(
                serie,
                fecha,
            )

            # Sin ventas en 90 días el backend no ejecuta el
            # modelo, por lo que estas filas solo agregan ruido.
            if variables["dias_con_ventas_90d"] == 0:
                continue

            promedio_90 = variables[
                "ventas_promedio_90d"
            ]

            # Evita productos sin demanda histórica utilizable.
            # El generador mantiene una demanda base positiva.
            promedio_referencia = max(
                promedio_90,
                demanda_base * 0.05,
            )

            # Stock mínimo basado en cobertura de demanda.
            dias_stock_minimo = float(
                rng_producto.uniform(10, 90)
            )

            stock_minimo = (
                promedio_referencia * dias_stock_minimo
            )

            # Stock actual con una cobertura variable.
            # Escala logarítmica: cubre coberturas largas
            # (hasta 600 días) sin perder casos cortos.
            cobertura_simulada = float(
                np.exp(
                    rng_producto.uniform(
                        np.log(2),
                        np.log(600),
                    )
                )
            )

            stock_actual = (
                promedio_referencia * cobertura_simulada
            )

            cobertura_stock_dias = (
                stock_actual / promedio_90
                if promedio_90 > 0
                else 0.0
            )

            dias_hasta_agotar = (
                calcular_dias_hasta_agotar_stock(
                    stock_actual,
                    serie,
                    fecha,
                )
            )

            registro = {
                "id_producto": numero_producto,
                "fecha_referencia": fecha,
                "stock_actual": stock_actual,
                "stock_minimo": stock_minimo,
                "cobertura_stock_dias": cobertura_stock_dias,
                **variables,
                "dias_hasta_agotar_stock": dias_hasta_agotar,
            }

            registros.append(registro)

    dataset = pd.DataFrame(registros)

    dataset = dataset.sort_values(
        ["fecha_referencia", "id_producto"]
    ).reset_index(drop=True)

    dataset.to_csv(
        ARCHIVO_DATASET,
        index=False,
        encoding="utf-8-sig",
    )

    print(f"\nDataset generado: {ARCHIVO_DATASET}")
    print(f"Registros: {len(dataset)}")
    print(
        f"Productos: {dataset['id_producto'].nunique()}"
    )
    print(
        f"Fechas: {dataset['fecha_referencia'].nunique()}"
    )
    print(
        "Periodo:",
        dataset["fecha_referencia"].min().date(),
        "a",
        dataset["fecha_referencia"].max().date(),
    )

    return dataset


# ============================================================
# 7. CONFIGURACIÓN DE MODELOS
# ============================================================

def crear_random_forest():
    return RandomForestRegressor(
        n_estimators=400,
        max_depth=None,
        min_samples_split=4,
        min_samples_leaf=2,
        max_features=0.9,
        random_state=SEMILLA,
        n_jobs=-1,
    )


def calcular_metricas(y_real, y_predicho):

    y_predicho = np.maximum(
        np.asarray(y_predicho),
        0,
    )

    return {
        "MAE": float(
            mean_absolute_error(y_real, y_predicho)
        ),
        "RMSE": float(
            np.sqrt(
                mean_squared_error(y_real, y_predicho)
            )
        ),
        "R2": float(
            r2_score(y_real, y_predicho)
        ),
    }

def calcular_rangos_variables(dataset):
    """
    Calcula los rangos observados de las variables predictoras
    en el dataset utilizado para entrenar el modelo final.
    """

    rangos = {}

    for variable in FEATURES_AMPLIADAS:
        valores = dataset[variable].astype(float)

        rangos[variable] = {
            "minimo": float(valores.min()),
            "maximo": float(valores.max()),
            "percentil_01": float(valores.quantile(0.01)),
            "percentil_99": float(valores.quantile(0.99)),
        }

    return rangos


# ============================================================
# 8. REFERENCIA MATEMÁTICA
# ============================================================

def predecir_referencia_matematica(dataset):
    """
    Referencia matemática:

    días estimados = stock actual / ventas promedio 90 días
    """

    promedio = dataset[
        "ventas_promedio_90d"
    ].to_numpy()

    stock = dataset[
        "stock_actual"
    ].to_numpy()

    predicciones = np.divide(
        stock,
        promedio,
        out=np.zeros_like(stock, dtype=float),
        where=promedio > 0,
    )

    return np.maximum(predicciones, 0)


# ============================================================
# 9. EVALUACIÓN CRONOLÓGICA CON PURGA TEMPORAL
# ============================================================

def evaluar_cronologicamente(dataset):

    print("\n" + "=" * 65)
    print("EVALUACIÓN CRONOLÓGICA CON PURGA TEMPORAL")
    print("=" * 65)

    datos = dataset.copy()

    datos["fecha_referencia"] = pd.to_datetime(
        datos["fecha_referencia"]
    )

    entrenamiento_inicial = datos[
        datos["fecha_referencia"] < FECHA_CORTE
    ].copy()

    prueba = datos[
        datos["fecha_referencia"] >= FECHA_CORTE
    ].copy()

    # Se purgan registros cuyo agotamiento real ocurre
    # después de la fecha de corte.
    fecha_agotamiento = (
        entrenamiento_inicial["fecha_referencia"]
        + pd.to_timedelta(
            entrenamiento_inicial[
                VARIABLE_OBJETIVO
            ],
            unit="D",
        )
    )

    mascara_valida = fecha_agotamiento <= FECHA_CORTE

    entrenamiento = entrenamiento_inicial[
        mascara_valida
    ].copy()

    cantidad_purgada = (
        len(entrenamiento_inicial) - len(entrenamiento)
    )

    print(
        f"Entrenamiento inicial: {len(entrenamiento_inicial)}"
    )
    print(f"Registros purgados: {cantidad_purgada}")
    print(f"Entrenamiento final: {len(entrenamiento)}")
    print(f"Prueba: {len(prueba)}")

    print(
        "Última fecha de entrenamiento:",
        entrenamiento["fecha_referencia"].max().date(),
    )

    print(
        "Primera fecha de prueba:",
        prueba["fecha_referencia"].min().date(),
    )

    if len(entrenamiento) == 0 or len(prueba) == 0:
        raise ValueError(
            "No existen suficientes registros para la "
            "evaluación cronológica."
        )

    X_train_3 = entrenamiento[FEATURES_3]
    X_test_3 = prueba[FEATURES_3]

    X_train_4 = entrenamiento[FEATURES_4]
    X_test_4 = prueba[FEATURES_4]

    X_train_exp = entrenamiento[FEATURES_AMPLIADAS]
    X_test_exp = prueba[FEATURES_AMPLIADAS]

    y_train = entrenamiento[
        VARIABLE_OBJETIVO
    ].to_numpy()

    y_test = prueba[
        VARIABLE_OBJETIVO
    ].to_numpy()

    resultados = {}

    # --------------------------------------------------------
    # Dummy
    # --------------------------------------------------------

    pred_dummy = np.full(
        len(y_test),
        np.mean(y_train),
    )

    resultados["Dummy"] = calcular_metricas(
        y_test,
        pred_dummy,
    )

    # --------------------------------------------------------
    # Referencia matemática
    # --------------------------------------------------------

    pred_formula = predecir_referencia_matematica(
        prueba
    )

    resultados["Referencia matematica"] = (
        calcular_metricas(
            y_test,
            pred_formula,
        )
    )

    # --------------------------------------------------------
    # Random Forest de 3 variables
    # --------------------------------------------------------

    modelo_3 = crear_random_forest()

    modelo_3.fit(X_train_3, y_train)

    pred_3 = modelo_3.predict(X_test_3)

    resultados["RF 3 variables"] = calcular_metricas(
        y_test,
        pred_3,
    )

    # --------------------------------------------------------
    # Random Forest de 4 variables
    # --------------------------------------------------------

    modelo_4 = crear_random_forest()

    modelo_4.fit(X_train_4, y_train)

    pred_4 = modelo_4.predict(X_test_4)

    resultados["RF 4 variables"] = calcular_metricas(
        y_test,
        pred_4,
    )

    # --------------------------------------------------------
    # Random Forest ampliado
    # --------------------------------------------------------

    modelo_exp = crear_random_forest()

    modelo_exp.fit(X_train_exp, y_train)

    pred_exp = modelo_exp.predict(X_test_exp)

    resultados["RF ampliado"] = calcular_metricas(
        y_test,
        pred_exp,
    )

    # --------------------------------------------------------
    # Modelo híbrido
    # --------------------------------------------------------

    cobertura_train = entrenamiento[
        "cobertura_stock_dias"
    ].to_numpy()

    cobertura_test = prueba[
        "cobertura_stock_dias"
    ].to_numpy()

    residuo_train = y_train - cobertura_train

    modelo_hibrido = crear_random_forest()

    modelo_hibrido.fit(
        X_train_exp,
        residuo_train,
    )

    correccion = modelo_hibrido.predict(
        X_test_exp
    )

    pred_hibrida = np.maximum(
        cobertura_test + correccion,
        0,
    )

    resultados["Hibrido RF ampliado"] = (
        calcular_metricas(
            y_test,
            pred_hibrida,
        )
    )

    return {
        "resultados": resultados,
        "modelo_rf_ampliado": modelo_exp,
        "entrenamiento": entrenamiento,
        "prueba": prueba,
    }


# ============================================================
# 10. EVALUACIÓN GROUPKFOLD POR PRODUCTO
# ============================================================

def evaluar_groupkfold(dataset):

    print("\n" + "=" * 65)
    print("EVALUACIÓN GROUPKFOLD POR PRODUCTO")
    print("=" * 65)

    X_3 = dataset[FEATURES_3]
    X_4 = dataset[FEATURES_4]
    X_exp = dataset[FEATURES_AMPLIADAS]

    y = dataset[
        VARIABLE_OBJETIVO
    ].to_numpy()

    grupos = dataset[
        "id_producto"
    ].to_numpy()

    group_kfold = GroupKFold(
        n_splits=CANTIDAD_FOLDS
    )

    nombres_modelos = [
        "Dummy",
        "Referencia matematica",
        "RF 3 variables",
        "RF 4 variables",
        "RF ampliado",
        "Hibrido RF ampliado",
    ]

    predicciones_globales = {
        nombre: np.zeros(len(dataset))
        for nombre in nombres_modelos
    }

    metricas_folds = {
        nombre: []
        for nombre in nombres_modelos
    }

    for numero_fold, (indices_train, indices_test) in enumerate(
        group_kfold.split(X_exp, y, grupos),
        start=1,
    ):

        print(f"\nFold {numero_fold}/{CANTIDAD_FOLDS}")

        train = dataset.iloc[indices_train]
        test = dataset.iloc[indices_test]

        y_train = y[indices_train]
        y_test = y[indices_test]

        # Dummy.
        pred_dummy = np.full(
            len(test),
            np.mean(y_train),
        )

        # Referencia matemática.
        pred_formula = predecir_referencia_matematica(
            test
        )

        # RF de 3 variables.
        modelo_3 = crear_random_forest()

        modelo_3.fit(
            X_3.iloc[indices_train],
            y_train,
        )

        pred_3 = modelo_3.predict(
            X_3.iloc[indices_test]
        )

        # RF de 4 variables.
        modelo_4 = crear_random_forest()

        modelo_4.fit(
            X_4.iloc[indices_train],
            y_train,
        )

        pred_4 = modelo_4.predict(
            X_4.iloc[indices_test]
        )

        # RF ampliado.
        modelo_exp = crear_random_forest()

        modelo_exp.fit(
            X_exp.iloc[indices_train],
            y_train,
        )

        pred_exp = modelo_exp.predict(
            X_exp.iloc[indices_test]
        )

        # Modelo híbrido.
        cobertura_train = train[
            "cobertura_stock_dias"
        ].to_numpy()

        cobertura_test = test[
            "cobertura_stock_dias"
        ].to_numpy()

        residuo_train = y_train - cobertura_train

        modelo_hibrido = crear_random_forest()

        modelo_hibrido.fit(
            X_exp.iloc[indices_train],
            residuo_train,
        )

        correccion = modelo_hibrido.predict(
            X_exp.iloc[indices_test]
        )

        pred_hibrida = np.maximum(
            cobertura_test + correccion,
            0,
        )

        predicciones_fold = {
            "Dummy": pred_dummy,
            "Referencia matematica": pred_formula,
            "RF 3 variables": pred_3,
            "RF 4 variables": pred_4,
            "RF ampliado": pred_exp,
            "Hibrido RF ampliado": pred_hibrida,
        }

        for nombre, prediccion in predicciones_fold.items():

            prediccion = np.maximum(
                prediccion,
                0,
            )

            metricas = calcular_metricas(
                y_test,
                prediccion,
            )

            metricas_folds[nombre].append(
                metricas
            )

            predicciones_globales[nombre][
                indices_test
            ] = prediccion

            print(
                f"{nombre}: "
                f"MAE={metricas['MAE']:.4f} | "
                f"RMSE={metricas['RMSE']:.4f} | "
                f"R2={metricas['R2']:.4f}"
            )

    resultados = {}

    for nombre in nombres_modelos:

        metricas_lista = metricas_folds[nombre]

        mae_valores = [
            m["MAE"] for m in metricas_lista
        ]

        rmse_valores = [
            m["RMSE"] for m in metricas_lista
        ]

        r2_valores = [
            m["R2"] for m in metricas_lista
        ]

        metricas_globales = calcular_metricas(
            y,
            predicciones_globales[nombre],
        )

        resultados[nombre] = {
            "MAE_promedio_folds": float(
                np.mean(mae_valores)
            ),
            "MAE_desviacion_folds": float(
                np.std(mae_valores)
            ),
            "RMSE_promedio_folds": float(
                np.mean(rmse_valores)
            ),
            "R2_promedio_folds": float(
                np.mean(r2_valores)
            ),
            "MAE_global": metricas_globales["MAE"],
            "RMSE_global": metricas_globales["RMSE"],
            "R2_global": metricas_globales["R2"],
        }

    return resultados


# ============================================================
# 11. COMPARACIÓN Y SELECCIÓN DEL MODELO
# ============================================================

def seleccionar_modelo(
    resultados_cronologicos,
    resultados_groupkfold,
):
    """
    Se selecciona el RF ampliado como modelo ML final.

    Se verifica si supera consistentemente la referencia
    matemática en MAE, tanto cronológicamente como en
    generalización a productos no vistos.

    El híbrido y los otros RF se mantienen como alternativas
    evaluadas, pero no se seleccionan automáticamente.
    """

    formula_crono = resultados_cronologicos[
        "Referencia matematica"
    ]["MAE"]

    rf_crono = resultados_cronologicos[
        "RF ampliado"
    ]["MAE"]

    formula_group = resultados_groupkfold[
        "Referencia matematica"
    ]["MAE_global"]

    rf_group = resultados_groupkfold[
        "RF ampliado"
    ]["MAE_global"]

    mejora_crono = (
        (formula_crono - rf_crono)
        / formula_crono
        * 100
    )

    mejora_group = (
        (formula_group - rf_group)
        / formula_group
        * 100
    )

    print("\n" + "=" * 65)
    print("ANÁLISIS DE SELECCIÓN")
    print("=" * 65)

    print(
        f"Mejora RF ampliado en cronológica: "
        f"{mejora_crono:.2f}%"
    )

    print(
        f"Mejora RF ampliado en GroupKFold: "
        f"{mejora_group:.2f}%"
    )

    supera_consistentemente = (
        mejora_crono > 0
        and mejora_group > 0
    )

    # Para mantener una integración sencilla con Django,
    # se selecciona el RF ampliado como modelo final.
    # El híbrido se conserva como alternativa evaluada.
    modelo_seleccionado = "RF ampliado"

    if supera_consistentemente:
        conclusion = (
            "El RF ampliado supera la referencia matemática "
            "en ambas evaluaciones. Se selecciona como modelo "
            "ML final y presenta una mejora consistente "
            "en los conjuntos evaluados."
        )
    else:
        conclusion = (
            "El RF ampliado no supera consistentemente la "
            "referencia matemática. Se selecciona como modelo "
            "ML final por ser la alternativa ampliada evaluada, "
            "pero la referencia matemática mantiene el mejor "
            "desempeño en al menos una de las evaluaciones. "
            "No se debe afirmar que el ML es más preciso."
        )

    print("\nModelo ML seleccionado:", modelo_seleccionado)
    print("\nConclusión:")
    print(conclusion)

    return {
        "modelo_seleccionado": modelo_seleccionado,
        "supera_consistentemente": bool(
            supera_consistentemente
        ),
        "mejora_mae_cronologica_pct": float(
            mejora_crono
        ),
        "mejora_mae_groupkfold_pct": float(
            mejora_group
        ),
        "conclusion": conclusion,
    }


# ============================================================
# 12. ENTRENAMIENTO FINAL CON TODOS LOS DATOS
# ============================================================

def entrenar_y_guardar_modelo(dataset, resultados):

    print("\n" + "=" * 65)
    print("ENTRENAMIENTO FINAL DEL MODELO")
    print("=" * 65)

    X = dataset[FEATURES_AMPLIADAS]

    y = dataset[
        VARIABLE_OBJETIVO
    ].to_numpy()

    modelo_final = crear_random_forest()

    modelo_final.fit(X, y)

    # Calcular rangos observados durante el entrenamiento.
    rangos_variables = calcular_rangos_variables(dataset)

    # Guardar los rangos en un archivo independiente.
    with open(
        ARCHIVO_RANGOS,
        "w",
        encoding="utf-8",
    ) as archivo:
        json.dump(
            rangos_variables,
            archivo,
            indent=4,
            ensure_ascii=False,
        )

    # Guardar el modelo como objeto RandomForestRegressor.
    # Esto permite que el código de Django pueda cargarlo
    # directamente mediante joblib.load().
    joblib.dump(
        modelo_final,
        ARCHIVO_MODELO,
    )

    # Importancia de las variables.
    importancia = pd.DataFrame({
        "variable": FEATURES_AMPLIADAS,
        "importancia": modelo_final.feature_importances_,
    }).sort_values(
        "importancia",
        ascending=False,
    )

    importancia.to_csv(
        ARCHIVO_IMPORTANCIA,
        index=False,
        encoding="utf-8-sig",
    )

    # Metadatos para documentar el modelo.
    metadatos = {
        "nombre_modelo": "Random Forest ampliado",
        "tipo_modelo": "RandomForestRegressor",
        "version": "2.0",
        "fecha_generacion": pd.Timestamp.now().isoformat(),
        "origen_datos": "Dataset sintético",
        "cantidad_registros": int(len(dataset)),
        "cantidad_productos": int(
            dataset["id_producto"].nunique()
        ),
        "variable_objetivo": VARIABLE_OBJETIVO,
        "variables_predictoras": FEATURES_AMPLIADAS,
        "rangos_variables": rangos_variables,
        "parametros": modelo_final.get_params(),
        "evaluacion_cronologica": resultados[
            "cronologica"
        ],
        "evaluacion_groupkfold": resultados[
            "groupkfold"
        ],
        "seleccion": resultados["seleccion"],
        "advertencia": (
            "Modelo entrenado exclusivamente con datos "
            "sintéticos. Las métricas no representan "
            "validación con datos reales de Ecoterra."
        ),
    }

    with open(
        ARCHIVO_METRICAS,
        "w",
        encoding="utf-8",
    ) as archivo:

        json.dump(
            metadatos,
            archivo,
            indent=4,
            ensure_ascii=False,
            default=str,
        )

    print("\nModelo guardado:", ARCHIVO_MODELO)
    print("Métricas y metadatos:", ARCHIVO_METRICAS)
    print("Importancia de variables:", ARCHIVO_IMPORTANCIA)

    print("\nImportancia de variables:")

    for _, fila in importancia.iterrows():

        print(
            f"{fila['variable']}: "
            f"{fila['importancia']:.4f}"
        )

    return modelo_final


# ============================================================
# 13. RESUMEN COMPARATIVO
# ============================================================

def mostrar_comparacion(
    resultados_cronologicos,
    resultados_groupkfold,
):

    print("\n" + "=" * 90)
    print("COMPARACIÓN FINAL DE MODELOS")
    print("=" * 90)

    filas = []

    for nombre in resultados_cronologicos:

        crono = resultados_cronologicos[nombre]
        group = resultados_groupkfold[nombre]

        filas.append({
            "Modelo": nombre,
            "MAE cronológico": crono["MAE"],
            "RMSE cronológico": crono["RMSE"],
            "R2 cronológico": crono["R2"],
            "MAE GroupKFold": group["MAE_global"],
            "RMSE GroupKFold": group["RMSE_global"],
            "R2 GroupKFold": group["R2_global"],
        })

    tabla = pd.DataFrame(filas)

    print(
        tabla.to_string(
            index=False,
            float_format=lambda x: f"{x:.4f}",
        )
    )

    return tabla


# ============================================================
# 14. EJECUCIÓN PRINCIPAL
# ============================================================

def main():

    print("\n")
    print("#" * 70)
    print("ECOTERRA - MODELO 3: SELECCIÓN FINAL")
    print("#" * 70)

    # 1. Generar dataset.
    dataset = generar_dataset()

    # 2. Verificar integridad.
    if dataset.isnull().any().any():
        raise ValueError(
            "El dataset contiene valores nulos."
        )

    if dataset.duplicated(
        subset=["id_producto", "fecha_referencia"]
    ).any():
        raise ValueError(
            "Existen registros duplicados por producto y fecha."
        )

    
    # Variables que obligatoriamente deben ser no negativas.
    FEATURES_NO_NEGATIVAS = [
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

    # Verificar que las variables no negativas
    # no contengan valores inferiores a cero.
    if (
        dataset[FEATURES_NO_NEGATIVAS] < 0
    ).any().any():
        raise ValueError(
            "Existen valores negativos en variables "
            "que deberían ser no negativas."
        )

    # Las variables de tendencia y variación pueden
    # contener valores negativos de forma legítima.


    # 3. Evaluación cronológica.
    evaluacion_crono = evaluar_cronologicamente(
        dataset
    )

    # 4. Evaluación GroupKFold.
    evaluacion_group = evaluar_groupkfold(
        dataset
    )

    # 5. Selección.
    seleccion = seleccionar_modelo(
        evaluacion_crono["resultados"],
        evaluacion_group,
    )

    # 6. Comparación general.
    tabla = mostrar_comparacion(
        evaluacion_crono["resultados"],
        evaluacion_group,
    )

    tabla.to_csv(
        DIRECTORIO_SALIDA / "comparacion_modelos.csv",
        index=False,
        encoding="utf-8-sig",
    )

    # 7. Preparar resultados para guardar.
    resultados_guardado = {
        "cronologica": evaluacion_crono["resultados"],
        "groupkfold": evaluacion_group,
        "seleccion": seleccion,
    }

    # 8. Entrenar el RF ampliado con todos los datos.
    entrenar_y_guardar_modelo(
        dataset,
        resultados_guardado,
    )

    print("\n" + "#" * 70)
    print("PROCESO FINALIZADO")
    print("#" * 70)

    print("Rangos de entrenamiento:", ARCHIVO_RANGOS)

    print("\nArchivos generados:")

    print(f"- {ARCHIVO_DATASET}")
    print(f"- {ARCHIVO_MODELO}")
    print(f"- {ARCHIVO_METRICAS}")
    print(f"- {ARCHIVO_IMPORTANCIA}")
    print(
        f"- {DIRECTORIO_SALIDA / 'comparacion_modelos.csv'}"
    )

    print("\nModelo ML guardado: Random Forest ampliado.")

    print(
        "\nRecuerda: antes de integrarlo al backend, "
        "deberás actualizar el predictor para que reciba "
        "las 13 variables utilizadas por este modelo."
    )


if __name__ == "__main__":
    main()
