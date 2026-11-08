# backend/inventario/stock_facturas.py
"""Salidas y devoluciones automáticas de stock asociadas a facturas.

Al emitir una factura se descuenta su cantidad de los lotes disponibles,
empezando por el que vence antes (FEFO). Al anular una factura emitida, se
devuelve a los mismos lotes lo que se descontó. Ambas operaciones deben
llamarse dentro de una transacción atómica.
"""
from collections import defaultdict
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Inventario, Movimiento
from .serializers import CAPACIDAD_ENVASE

ESTADO_LOTE_DISPONIBLE = "Disponible"
OBSERVACION_SALIDA = "Salida automática por emisión de factura."
OBSERVACION_DEVOLUCION = "Devolución automática por anulación de factura."


def referencia_factura(factura):
    return f"Factura {factura.numero_factura}"[:100]


# Descuenta de los lotes disponibles y no vencidos la cantidad de cada producto de la factura.
def descontar_stock_factura(factura, id_usuario):
    cantidades = defaultdict(Decimal)
    nombres = {}
    for detalle in factura.detalles.select_related("id_producto"):
        cantidades[detalle.id_producto_id] += detalle.cantidad
        nombres[detalle.id_producto_id] = detalle.id_producto.nombre

    hoy = timezone.localdate()
    ahora = timezone.now()
    referencia = referencia_factura(factura)
    planes = []
    faltantes = []

    for id_producto in sorted(cantidades):
        requerido = cantidades[id_producto]
        lotes = list(
            Inventario.objects.select_for_update()
            .filter(
                id_producto=id_producto,
                estado=ESTADO_LOTE_DISPONIBLE,
                fecha_vencimiento__gt=hoy,
                cantidad__gt=0,
            )
            .order_by("fecha_vencimiento", "id")
        )
        disponible = sum((lote.cantidad for lote in lotes), Decimal("0"))
        if disponible < requerido:
            faltantes.append(
                f"{nombres[id_producto]}: se requieren {requerido} y hay {disponible} disponibles"
            )
            continue
        pendiente = requerido
        for lote in lotes:
            if pendiente <= 0:
                break
            usado = min(lote.cantidad, pendiente)
            planes.append((lote, usado))
            pendiente -= usado

    if faltantes:
        raise ValidationError({
            "detalles": "Stock insuficiente para emitir la factura. " + "; ".join(faltantes) + "."
        })

    for lote, usado in planes:
        anterior = lote.cantidad
        lote.cantidad = anterior - usado
        lote.save(update_fields=["cantidad"])
        Movimiento.objects.create(
            id_inventario=lote.id,
            id_usuario=id_usuario,
            tipo_movimiento="Salida",
            cantidad_movimiento=usado,
            stock_anterior=anterior,
            stock_posterior=lote.cantidad,
            fecha_movimiento=ahora,
            referencia=referencia,
            observacion=OBSERVACION_SALIDA,
        )


# Devuelve a cada lote lo que se descontó al emitir la factura.
def devolver_stock_factura(factura, id_usuario):
    referencia = referencia_factura(factura)
    salidas = Movimiento.objects.filter(
        tipo_movimiento="Salida",
        referencia=referencia,
        observacion=OBSERVACION_SALIDA,
    )
    por_lote = defaultdict(Decimal)
    for salida in salidas:
        por_lote[salida.id_inventario] += salida.cantidad_movimiento
    if not por_lote:
        # Factura emitida antes de existir el descuento automático: no hay nada que devolver.
        return

    ahora = timezone.now()
    lotes = Inventario.objects.select_for_update().filter(pk__in=por_lote).order_by("id")
    for lote in lotes:
        devuelto = por_lote[lote.id]
        anterior = lote.cantidad
        posterior = anterior + devuelto
        capacidad = CAPACIDAD_ENVASE.get(lote.tipo_envase)
        if capacidad is not None and posterior > capacidad:
            raise ValidationError({
                "detail": (
                    f"No se puede devolver el stock al lote {lote.codigo_lote or lote.id}: "
                    f"quedaría con {posterior} L y su capacidad es {capacidad} L."
                )
            })
        lote.cantidad = posterior
        lote.save(update_fields=["cantidad"])
        Movimiento.objects.create(
            id_inventario=lote.id,
            id_usuario=id_usuario,
            tipo_movimiento="Entrada",
            cantidad_movimiento=devuelto,
            stock_anterior=anterior,
            stock_posterior=posterior,
            fecha_movimiento=ahora,
            referencia=referencia,
            observacion=OBSERVACION_DEVOLUCION,
        )
