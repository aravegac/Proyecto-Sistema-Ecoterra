import pandas as pd
import numpy as np
import joblib
from pathlib import Path

from sklearn.ensemble import RandomForestRegressor
from sklearn.dummy import DummyRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =====================================================
# 1. CARGAR DATASET
# =====================================================

BASE_DIR = Path(__file__).resolve().parent
RUTA_DATASET = BASE_DIR / "dataset_stock.csv"
df = pd.read_csv(RUTA_DATASET)

columnas_requeridas = [
    "codigo_producto",
    "fecha_referencia",
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d",
    "dias_hasta_agotar_stock"
]

# Comprobar columnas.
faltantes = [
    columna for columna in columnas_requeridas
    if columna not in df.columns
]

if faltantes:
    raise ValueError(
        f"Faltan columnas en el CSV: {faltantes}"
    )

# Convertir tipos de datos.
df["fecha_referencia"] = pd.to_datetime(
    df["fecha_referencia"],
    errors="coerce"
)

columnas_numericas = [
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d",
    "dias_hasta_agotar_stock"
]

for columna in columnas_numericas:
    df[columna] = pd.to_numeric(
        df[columna],
        errors="coerce"
    )

# Limpiar registros incompletos.
df = df.dropna(subset=columnas_requeridas)

# Validaciones básicas.
if df.empty:
    raise ValueError("El dataset no contiene registros válidos.")

if df.duplicated(
    subset=["codigo_producto", "fecha_referencia"]
).any():
    raise ValueError(
        "Hay observaciones duplicadas por producto y fecha."
    )

if (
    (df["stock_actual"] <= 0).any()
    or (df["stock_minimo"] <= 0).any()
    or (df["ventas_promedio_90d"] <= 0).any()
    or (df["dias_hasta_agotar_stock"] <= 0).any()
):
    raise ValueError(
        "Existen valores no positivos en variables que "
        "deben ser mayores que cero."
    )

df = df.sort_values("fecha_referencia").reset_index(drop=True)


# =====================================================
# 2. DEFINIR VARIABLES
# =====================================================

# Variables de entrada (X).
caracteristicas = [
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d"
]

X = df[caracteristicas]

# Variable objetivo (y).
y = df["dias_hasta_agotar_stock"]


# =====================================================
# 3. DIVISIÓN CRONOLÓGICA
# =====================================================

# Se utilizan las primeras fechas para entrenar
# y las últimas fechas para evaluar.

fechas = sorted(df["fecha_referencia"].unique())

if len(fechas) < 5:
    raise ValueError(
        "Se necesitan al menos 5 fechas distintas."
    )

indice_corte = int(len(fechas) * 0.80)

fecha_corte = fechas[indice_corte]

mascara_train = df["fecha_referencia"] < fecha_corte
mascara_test = df["fecha_referencia"] >= fecha_corte

X_train = X.loc[mascara_train]
X_test = X.loc[mascara_test]

y_train = y.loc[mascara_train]
y_test = y.loc[mascara_test]

if X_train.empty or X_test.empty:
    raise ValueError(
        "La división cronológica produjo un conjunto vacío."
    )

print("\n========== DIVISIÓN DEL DATASET ==========")
print(f"Fecha de corte: {pd.Timestamp(fecha_corte).date()}")
print(f"Registros de entrenamiento: {len(X_train)}")
print(f"Registros de prueba: {len(X_test)}")
print(f"Productos: {df['codigo_producto'].nunique()}")


# =====================================================
# 4. MODELO DE REFERENCIA
# =====================================================

modelo_base = DummyRegressor(strategy="mean")

modelo_base.fit(X_train, y_train)

predicciones_base = modelo_base.predict(X_test)


# =====================================================
# 5. RANDOM FOREST REGRESSOR
# =====================================================

modelo_rf = RandomForestRegressor(
    n_estimators=200,
    max_depth=8,
    min_samples_leaf=2,
    random_state=42,
    n_jobs=-1
)

modelo_rf.fit(X_train, y_train)

predicciones_rf = modelo_rf.predict(X_test)


# =====================================================
# 6. EVALUACIÓN
# =====================================================

def evaluar_modelo(nombre, reales, predicciones):

    mae = mean_absolute_error(
        reales,
        predicciones
    )

    rmse = np.sqrt(
        mean_squared_error(reales, predicciones)
    )

    r2 = r2_score(
        reales,
        predicciones
    )

    return {
        "Modelo": nombre,
        "MAE (días)": round(mae, 2),
        "RMSE (días)": round(rmse, 2),
        "R2": round(r2, 4)
    }


resultados = [
    evaluar_modelo(
        "Modelo de referencia",
        y_test,
        predicciones_base
    ),
    evaluar_modelo(
        "Random Forest",
        y_test,
        predicciones_rf
    )
]

tabla_resultados = pd.DataFrame(resultados)

print("\n========== RESULTADOS DE EVALUACIÓN ==========")
print(tabla_resultados.to_string(index=False))


# =====================================================
# 7. COMPARACIÓN
# =====================================================

mae_base = mean_absolute_error(
    y_test,
    predicciones_base
)

mae_rf = mean_absolute_error(
    y_test,
    predicciones_rf
)

rmse_base = np.sqrt(
    mean_squared_error(y_test, predicciones_base)
)

rmse_rf = np.sqrt(
    mean_squared_error(y_test, predicciones_rf)
)

print("\n========== COMPARACIÓN ==========")

if mae_rf < mae_base and rmse_rf < rmse_base:
    print(
        "Random Forest mejora ambas métricas "
        "respecto al modelo de referencia."
    )
else:
    print(
        "Random Forest no mejora ambas métricas. "
        "Se debe revisar el modelo y el dataset."
    )


# =====================================================
# 8. IMPORTANCIA DE LAS VARIABLES
# =====================================================

importancias = pd.DataFrame({
    "Variable": caracteristicas,
    "Importancia": modelo_rf.feature_importances_
})

importancias = importancias.sort_values(
    by="Importancia",
    ascending=False
)

print("\n========== IMPORTANCIA DE VARIABLES ==========")
print(importancias.to_string(index=False))


# =====================================================
# 9. GUARDAR MODELO ENTRENADO
# =====================================================

RUTA_MODELO = BASE_DIR / "modelo_stock.pkl"

joblib.dump(
    modelo_rf,
    RUTA_MODELO
)

print(f"\nModelo guardado en: {RUTA_MODELO}")


# =====================================================
# 10. EJEMPLO DE PREDICCIÓN
# =====================================================

ejemplo = pd.DataFrame([{
    "stock_actual": 1200,
    "stock_minimo": 600,
    "ventas_promedio_90d": 15.5
}])

prediccion = modelo_rf.predict(ejemplo)[0]

print("\n========== EJEMPLO DE PREDICCIÓN ==========")
print(f"Días estimados hasta agotar stock: {prediccion:.1f}")
