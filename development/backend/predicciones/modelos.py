"""Modelos demostrativos reproducibles; nunca representan observaciones reales."""
import math
import random
from datetime import date, timedelta
from functools import lru_cache

PUERTOS = ["Corpus Christi, TX", "Miami, FL", "Los Angeles, CA"]
NAVIERAS = ["MSC", "Maersk", "CMA CGM"]
CARGAS = ["Exclusiva", "Consolidada"]
BASE = date(2024, 1, 1)

def variables_precio(producto, fecha, cantidad):
    return {"producto": producto, "dia": (fecha-BASE).days, "cantidad": cantidad,
            "mes_sin": math.sin(2*math.pi*fecha.month/12),
            "mes_cos": math.cos(2*math.pi*fecha.month/12)}

def entrenar(destino_datos=None):
    from sklearn.feature_extraction import DictVectorizer
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.pipeline import make_pipeline
    from sklearn.metrics import mean_absolute_error
    from sklearn.dummy import DummyRegressor

    rng = random.Random(42)
    llegada_x, llegada_y, precio_x, precio_y = [], [], [], []
    for i in range(1500):
        puerto, naviera, carga = rng.choice(PUERTOS), rng.choice(NAVIERAS), rng.choice(CARGAS)
        mes = rng.randint(1, 12)
        llegada_x.append(dict(puerto=puerto, naviera=naviera, carga=carga, mes=mes))
        llegada_y.append(30 + PUERTOS.index(puerto)*4 + NAVIERAS.index(naviera)*2
                         + (8 if carga == "Consolidada" else 0)
                         + 4*math.sin(2*math.pi*mes/12) + rng.gauss(0, 2))
        fecha = BASE + timedelta(days=i)
        producto = rng.choice(["POL-001", "POL-002", "POL-003", "POL-004", "POL-005"])
        cantidad = rng.randint(1, 100)
        precio_x.append(variables_precio(producto, fecha, cantidad))
        precio_y.append((22000 + int(producto[-1])*6500)*(1+i*.00012)
                        * (1-min(cantidad, 100)*.0008) + rng.gauss(0, 700))
    if destino_datos is not None:
        import csv
        destino_datos.mkdir(exist_ok=True)
        for nombre, x, y, objetivo in [("llegada", llegada_x, llegada_y, "dias"), ("precio", precio_x, precio_y, "precio_unitario_clp")]:
            with (destino_datos / (nombre + "_simulado.csv")).open("w", newline="", encoding="utf-8") as archivo:
                writer = csv.DictWriter(archivo, fieldnames=[*x[0], objetivo])
                writer.writeheader()
                writer.writerows(dict(fila, **{objetivo: round(valor,2)}) for fila,valor in zip(x,y))
    modelos = {}
    for tipo, x, y in [("llegada", llegada_x, llegada_y), ("precio", precio_x, precio_y)]:
        # Precio: validación temporal. Llegada: conjunto independiente reproducible.
        pares = list(zip(x, y))
        if tipo == "llegada": rng.shuffle(pares)
        corte = int(len(pares)*.8)
        desarrollo, test = pares[:corte], pares[corte:]
        train, validacion = desarrollo[:900], desarrollo[900:]
        def construir(hoja):
            return make_pipeline(DictVectorizer(sparse=False), RandomForestRegressor(
                n_estimators=100, min_samples_leaf=hoja, random_state=42, n_jobs=1))
        candidatos = []
        for hoja in [3, 8]:
            candidato = construir(hoja)
            candidato.fit([a for a,b in train], [b for a,b in train])
            error = mean_absolute_error([b for a,b in validacion], candidato.predict([a for a,b in validacion]))
            candidatos.append((float(error), hoja))
        _, hoja = min(candidatos)
        model = construir(hoja)
        model.fit([a for a,b in desarrollo], [b for a,b in desarrollo])
        mae = mean_absolute_error([b for a,b in test], model.predict([a for a,b in test]))
        baseline = DummyRegressor(strategy="mean").fit([[0] for _ in desarrollo], [b for a,b in desarrollo])
        error_base = mean_absolute_error([b for a,b in test], baseline.predict([[0] for _ in test]))
        modelos[tipo] = {"modelo": model, "mae": round(float(mae), 2),
                         "mae_base": round(float(error_base), 2), "min_samples_leaf": hoja,
                         "ajuste": [{"mae_validacion": round(error,2), "min_samples_leaf": h} for error,h in candidatos],
                         "entrenamiento": len(desarrollo), "prueba": len(test)}
    return modelos

@lru_cache(maxsize=1)
def cargar():
    from django.conf import settings
    from .portables import leer
    ruta = settings.BASE_DIR / "predicciones" / "artefactos" / "modelos.json"
    return leer(ruta)
