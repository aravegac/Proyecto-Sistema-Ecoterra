import csv
import random
import sys
from datetime import date, timedelta

random.seed(42)

# Producto: stock mínimo y demanda diaria promedio simulada (litros).
PRODUCTOS = {
    "POL-001": {"stock_minimo": 600, "demanda_diaria": 15},
    "POL-002": {"stock_minimo": 1000, "demanda_diaria": 30},
    "POL-003": {"stock_minimo": 2000, "demanda_diaria": 45},
    "POL-004": {"stock_minimo": 400, "demanda_diaria": 12},
    "POL-005": {"stock_minimo": 800, "demanda_diaria": 20},
    "POL-008": {"stock_minimo": 200000, "demanda_diaria": 2500},
    "POL-009": {"stock_minimo": 50000, "demanda_diaria": 700},
}

FECHA_FINAL = date(2026, 11, 3)
FECHA_INICIAL = FECHA_FINAL - timedelta(days=7 * 51)

# Se generan 90 días anteriores y 365 días posteriores.
FECHA_DATOS_INICIAL = FECHA_INICIAL - timedelta(days=90)
FECHA_DATOS_FINAL = FECHA_FINAL + timedelta(days=365)

def generar_demanda_diaria(promedio):
    """
    Demanda sintética con variabilidad diaria.
    Nunca genera ventas negativas.
    """
    valor = random.gauss(promedio, promedio * 0.25)
    return round(max(0, valor), 2)

writer = csv.writer(sys.stdout)

writer.writerow([
    "codigo_producto",
    "fecha_referencia",
    "stock_actual",
    "stock_minimo",
    "ventas_promedio_90d",
    "dias_hasta_agotar_stock"
])

for codigo, datos in PRODUCTOS.items():

    stock_minimo = datos["stock_minimo"]
    demanda_promedio = datos["demanda_diaria"]

    # Serie diaria sintética de demanda.
    demanda = {}
    fecha = FECHA_DATOS_INICIAL

    while fecha <= FECHA_DATOS_FINAL:
        demanda[fecha] = generar_demanda_diaria(
            demanda_promedio
        )
        fecha += timedelta(days=1)

    # 52 observaciones semanales por producto.
    for semana in range(52):

        fecha_ref = FECHA_INICIAL + timedelta(
            days=7 * semana
        )

        # Promedio diario de ventas de los 90 días previos,
        # incluyendo el día de referencia.
        ventas_90d = [
            demanda[fecha_ref - timedelta(days=d)]
            for d in range(90)
        ]

        promedio_90d = round(
            sum(ventas_90d) / 90,
            2
        )

        # Stock inicial simulado.
        stock_actual = round(
            random.uniform(
                stock_minimo * 1.10,
                stock_minimo * 2.00
            ),
            2
        )

        # Calcular días hasta agotar el inventario
        # utilizando las ventas futuras simuladas.
        acumulado = 0
        dias = 0

        while acumulado < stock_actual:
            dias += 1

            fecha_futura = fecha_ref + timedelta(
                days=dias
            )

            acumulado += demanda[fecha_futura]

        writer.writerow([
            codigo,
            fecha_ref.isoformat(),
            stock_actual,
            stock_minimo,
            promedio_90d,
            dias
        ])
