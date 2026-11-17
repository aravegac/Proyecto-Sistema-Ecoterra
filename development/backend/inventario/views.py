# invetario/views.py
from django.db import transaction

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response

from usuarios.permissions import PermisoModulo

from django.db.models import (
    OuterRef,
    Subquery,
    Sum,
    DecimalField,
    Value,
)
from django.db.models.functions import Coalesce

from .models import Inventario, Movimiento, Producto
from .serializers import (
    InventarioSerializer,
    MovimientoSerializer,
    ProductoSerializer,
)
# ---------- CÁLCULOS DE STOCK - Productos ----------
# Anota cada producto con la suma de sus lotes disponibles y la suma de todos sus lotes.
def productos_con_stock():
    campo_decimal = DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    stock_disponible = (
        Inventario.objects
        .filter(
            id_producto=OuterRef("id"),
            estado="Disponible",
        )
        .order_by()
        .values("id_producto")
        .annotate(total=Sum("cantidad"))
        .values("total")[:1]
    )

    stock_total = (
        Inventario.objects
        .filter(id_producto=OuterRef("id"))
        .order_by()
        .values("id_producto")
        .annotate(total=Sum("cantidad"))
        .values("total")[:1]
    )

    return Producto.objects.annotate(
        stock_disponible_calculado=Coalesce(
            Subquery(
                stock_disponible,
                output_field=campo_decimal,
            ),
            Value(Decimal("0.00")),
            output_field=campo_decimal,
        ),
        stock_total_calculado=Coalesce(
            Subquery(
                stock_total,
                output_field=campo_decimal,
            ),
            Value(Decimal("0.00")),
            output_field=campo_decimal,
        ),
    )

# ---------- Productos ----------
class ProductoListView(ListCreateAPIView):
    queryset = productos_con_stock()
    serializer_class = ProductoSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("productos", "Consultar"),
    "POST": ("productos", "Crear"),
}


class ProductoDetailView(RetrieveUpdateDestroyAPIView):
    queryset = productos_con_stock()
    serializer_class = ProductoSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("productos", "Consultar"),
    "PUT": ("productos", "Editar"),
    "PATCH": ("productos", "Editar"),
    "DELETE": ("productos", "Eliminar"),
    }



# ---------- Inventario (Lotes) ----------
class InventarioListView(ListCreateAPIView):
    queryset = Inventario.objects.all()
    serializer_class = InventarioSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("lotes", "Consultar"),
    "POST": ("lotes", "Crear"),
    }


class InventarioDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Inventario.objects.all()
    serializer_class = InventarioSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("lotes", "Consultar"),
    "PUT": ("lotes", "Editar"),
    "PATCH": ("lotes", "Editar"),
    "DELETE": ("lotes", "Eliminar"),
    }


# ---------- Movimientos ----------
class MovimientoListView(ListCreateAPIView):
    queryset = Movimiento.objects.all()
    serializer_class = MovimientoSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("movimientos", "Consultar"),
    "POST": ("movimientos", "Crear"),
    }

    # Valida el movimiento, bloquea el lote y registra la entrada, salida o ajuste junto con los stocks anterior y posterior.
    def create(self, request, *args, **kwargs):
        tipo = request.data.get("tipo_movimiento")
        cantidad_raw = request.data.get("cantidad_movimiento")
        id_inventario = request.data.get("id_inventario")
        id_usuario = request.data.get("id_usuario")

        # ---------- Validaciones básicas ----------
        if tipo not in ("Entrada", "Salida", "Ajuste"):
            return Response(
                {"detail": "Tipo de movimiento inválido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if cantidad_raw is None or cantidad_raw == "":
            return Response(
                {"detail": "La cantidad es obligatoria."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cantidad = Decimal(str(cantidad_raw))
        except Exception:
            return Response(
                {"detail": "Cantidad inválida."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ajuste permite 0 (vaciar lote); Entrada/Salida exigen > 0
        if tipo == "Ajuste":
            if cantidad < 0:
                return Response(
                    {"detail": "El stock final no puede ser negativo."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if cantidad <= 0:
                return Response(
                    {"detail": "La cantidad debe ser mayor a 0."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ---------- Transacción atómica con lock del lote ----------
        with transaction.atomic():
            try:
                lote = Inventario.objects.select_for_update().get(pk=id_inventario)
            except Inventario.DoesNotExist:
                return Response(
                    {"detail": "Lote no encontrado."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            stock_anterior = lote.cantidad

            # ---------- Aplicar regla según tipo ----------
            if tipo == "Entrada":
                lote.cantidad = lote.cantidad + cantidad
            elif tipo == "Salida":
                if lote.cantidad < cantidad:
                    return Response(
                        {
                            "detail": f"Stock insuficiente. Disponible: {lote.cantidad} L."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                lote.cantidad = lote.cantidad - cantidad
            else:  # Ajuste → ESTABLECE la cantidad final
                lote.cantidad = cantidad

            stock_posterior = lote.cantidad
            lote.save(update_fields=["cantidad"])

            # ---------- Enriquecer observación en Ajuste ----------
            observacion_base = request.data.get("observacion") or ""
            if tipo == "Ajuste":
                snapshot = (
                    f"Ajuste de inventario: stock anterior {stock_anterior} L "
                    f"→ stock final {stock_posterior} L."
                )
                observacion_final = (
                    f"{observacion_base}\n{snapshot}".strip()
                    if observacion_base
                    else snapshot
                )
            else:
                observacion_final = observacion_base or None

            # ---------- Crear el movimiento ----------
            movimiento = Movimiento.objects.create(
                id_inventario=lote.id,
                id_usuario=id_usuario,
                tipo_movimiento=tipo,
                cantidad_movimiento=cantidad,
                stock_anterior=stock_anterior,       #  NUEVO
                stock_posterior=stock_posterior,     #  NUEVO
                fecha_movimiento=timezone.now(),
                referencia=request.data.get("referencia") or None,
                observacion=observacion_final or None,
            )

        serializer = self.get_serializer(movimiento)
        return Response(serializer.data, status=status.HTTP_201_CREATED)