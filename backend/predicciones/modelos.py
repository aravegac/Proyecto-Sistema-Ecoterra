"""Modelos de predicción del panel IA.

- Llegada: datos simulados reproducibles (no hay registros reales de embarques).
- Precio: se entrena con las líneas de facturas reales del sistema.
"""
import math
import random
from datetime import date, timedelta
from functools import lru_cache

PUERTOS = ["Corpus Christi, TX", "Miami, FL", "Los Angeles, CA"]
NAVIERAS = ["MSC", "Maersk", "CMA CGM"]
CARGAS = ["Exclusiva", "Consolidada"]
BASE = date(2024, 1, 1)

# Mínimo de ventas facturadas para que un producto entre al modelo de precio.
MIN_VENTAS_PRECIO = 3
ESTADOS_FACTURA_EXCLUIDOS = ["ANULADA"]

def variables_precio(producto, fecha, cantidad):
    return {"producto": producto, "dia": (fecha-BASE).days, "cantidad": cantidad,
            "mes_sin": math.sin(2*math.pi*fecha.month/12),
            "mes_cos": math.cos(2*math.pi*fecha.month/12)}

def datos_precio_reales():
    """
    Lee el historial de precios desde las facturas (DetalleFactura).

    Cada línea de factura no anulada en CLP es una observación:
    producto, fecha de emisión, cantidad y precio unitario.
    Solo se incluyen productos con al menos MIN_VENTAS_PRECIO ventas.
    Retorna (x, y, fechas, ventas_por_producto) en orden cronológico.
    """
    from collections import Counter
    from facturacion.models import DetalleFactura

    filas = list(
        DetalleFactura.objects
        .exclude(id_factura__estado__in=ESTADOS_FACTURA_EXCLUIDOS)
        .filter(id_factura__moneda_factura="CLP", precio_unitario__gt=0, cantidad__gt=0)
        .values_list("id_producto__codigo", "id_factura__fecha_emision", "cantidad", "precio_unitario")
        .order_by("id_factura__fecha_emision", "id")
    )
    ventas = Counter(codigo for codigo, *_ in filas)
    validas = [f for f in filas if ventas[f[0]] >= MIN_VENTAS_PRECIO]
    x = [variables_precio(codigo, fecha, float(cantidad)) for codigo, fecha, cantidad, _ in validas]
    y = [float(precio) for *_, precio in validas]
    fechas = [fecha for _, fecha, _, _ in validas]
    por_producto = {codigo: n for codigo, n in sorted(ventas.items()) if n >= MIN_VENTAS_PRECIO}
    return x, y, fechas, por_producto


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
        # Se conservan las llamadas del antiguo precio simulado para que la
        # secuencia aleatoria (y por tanto el modelo de llegada) no cambie.
        rng.choice(range(5)); rng.randint(1, 100); rng.gauss(0, 700)
    precio_x, precio_y, precio_fechas, precio_productos = datos_precio_reales()
    if len(precio_x) < 10:
        raise ValueError(
            f"Hay {len(precio_x)} ventas facturadas utilizables; se necesitan al menos 10 "
            "para entrenar el modelo de precio."
        )
    if destino_datos is not None:
        import csv
        destino_datos.mkdir(exist_ok=True)
        for nombre, x, y, objetivo in [("llegada_simulado", llegada_x, llegada_y, "dias"), ("precio_facturas", precio_x, precio_y, "precio_unitario_clp")]:
            with (destino_datos / (nombre + ".csv")).open("w", newline="", encoding="utf-8") as archivo:
                writer = csv.DictWriter(archivo, fieldnames=[*x[0], objetivo])
                writer.writeheader()
                writer.writerows(dict(fila, **{objetivo: round(valor,2)}) for fila,valor in zip(x,y))
    modelos = {}
    for tipo, x, y in [("llegada", llegada_x, llegada_y), ("precio", precio_x, precio_y)]:
        # Precio: validación temporal (las facturas ya vienen en orden cronológico).
        # Llegada: conjunto independiente reproducible.
        pares = list(zip(x, y))
        if tipo == "llegada": rng.shuffle(pares)
        corte = int(len(pares)*.8)
        desarrollo, test = pares[:corte], pares[corte:]
        separacion = 900 if tipo == "llegada" else int(len(desarrollo)*.75)
        train, validacion = desarrollo[:separacion], desarrollo[separacion:]
        def construir(hoja):
            return make_pipeline(DictVectorizer(sparse=False), RandomForestRegressor(
                n_estimators=100, min_samples_leaf=hoja, random_state=42, n_jobs=1))
        candidatos = []
        # Con pocas facturas se prueban hojas más pequeñas.
        for hoja in ([3, 8] if tipo == "llegada" else [1, 2, 3]):
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
        if tipo == "precio":
            modelos[tipo].update(
                origen="facturas",
                productos=precio_productos,
                fecha_inicio_datos=precio_fechas[0].isoformat(),
                fecha_fin_entrenamiento=precio_fechas[-1].isoformat(),
            )
    return modelos

@lru_cache(maxsize=1)
def cargar():
    from django.conf import settings
    from .portables import leer
    ruta = settings.BASE_DIR / "predicciones" / "artefactos" / "modelos.json"
    return leer(ruta)
