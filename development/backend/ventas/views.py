# backend/ventas/views.py
from django.db import IntegrityError, transaction

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from usuarios.permissions import PermisoModulo
from .models import OrdenCompra, NotaCredito
from facturacion.models import Factura
from .serializers import OrdenCompraSerializer, NotaCreditoSerializer


class OrdenCompraViewSet(viewsets.ModelViewSet):
    queryset = OrdenCompra.objects.all().order_by("-id_oc")
    serializer_class = OrdenCompraSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("ordenes_compra", "Consultar"),
        "POST": ("ordenes_compra", "Crear"),
        "PUT": ("ordenes_compra", "Editar"),
        "PATCH": ("ordenes_compra", "Editar"),
        "DELETE": ("ordenes_compra", "Eliminar"),
    }

    # Filtra las órdenes por cliente, cotización, presencia de cotización y rango de fechas.
    def get_queryset(self):
        queryset = super().get_queryset()

        cliente_id = self.request.query_params.get("cliente_id")
        cotizacion_id = self.request.query_params.get("cotizacion_id")
        con_cotizacion = self.request.query_params.get("con_cotizacion")
        fecha_desde = self.request.query_params.get("fecha_desde")
        fecha_hasta = self.request.query_params.get("fecha_hasta")

        if cliente_id:
            queryset = queryset.filter(id_cliente_id=cliente_id)

        if cotizacion_id:
            queryset = queryset.filter(
                id_cotizacion_id=cotizacion_id
            )

        if con_cotizacion == "true":
            queryset = queryset.filter(id_cotizacion__isnull=False)
        elif con_cotizacion == "false":
            queryset = queryset.filter(id_cotizacion__isnull=True)

        if fecha_desde:
            queryset = queryset.filter(fecha_oc__gte=fecha_desde)

        if fecha_hasta:
            queryset = queryset.filter(fecha_oc__lte=fecha_hasta)

        return queryset

    # Valida y vincula una cotización a la orden y responde HTTP 409 ante un conflicto de integridad.
    @action(
        detail=True,
        methods=["post"],
        url_path="asociar-cotizacion",
    )
    def asociar_cotizacion(self, request, pk=None):
        orden = self.get_object()
        cotizacion_id = request.data.get("id_cotizacion")

        if cotizacion_id is None:
            return Response(
                {"error": "Debes indicar id_cotizacion."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(
            orden,
            data={
                "id_cliente": orden.id_cliente_id,
                "id_cotizacion": cotizacion_id,
            },
            partial=True,
        )

        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return Response(
                {
                    "error": (
                        "Esta cotización ya está asociada "
                        "a otra orden de compra."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            self.get_serializer(orden).data,
            status=status.HTTP_200_OK,
        )

    # Quita la cotización de la orden y devuelve sus datos actualizados.
    @action(
        detail=True,
        methods=["delete"],
        url_path="desasociar-cotizacion",
    )
    def desasociar_cotizacion(self, request, pk=None):
        orden = self.get_object()

        if orden.id_cotizacion_id is None:
            return Response(
                {"mensaje": "La orden ya está sin cotización."},
                status=status.HTTP_200_OK,
            )

        orden.id_cotizacion = None
        orden.save(update_fields=["id_cotizacion"])

        return Response(
            self.get_serializer(orden).data,
            status=status.HTTP_200_OK,
        )

    # Impide eliminar órdenes con factura asociada y elimina las demás.
    def perform_destroy(self, instance):
        if Factura.objects.filter(id_orden_compra_id=instance.id_oc).exists():
            raise ValidationError(
                "No se puede eliminar una orden que tiene una factura asociada."
            )

        instance.delete()


class NotaCreditoViewSet(viewsets.ModelViewSet):
    queryset = NotaCredito.objects.select_related(
        "id_factura",
        "id_factura__id_cliente",
    ).all().order_by("-fecha_emision", "-id")

    serializer_class = NotaCreditoSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("notas_credito", "Consultar"),
        "HEAD": ("notas_credito", "Consultar"),
        "OPTIONS": ("notas_credito", "Consultar"),
        "POST": ("notas_credito", "Crear"),
        "PUT": ("notas_credito", "Editar"),
        "PATCH": ("notas_credito", "Editar"),
        "DELETE": ("notas_credito", "Eliminar"),
    }

    # Filtra las notas de crédito por factura, estado y cliente de la factura.
    def get_queryset(self):
        queryset = super().get_queryset()

        factura_id = self.request.query_params.get("factura_id")
        estado = self.request.query_params.get("estado")
        cliente_id = self.request.query_params.get("cliente_id")

        if factura_id:
            queryset = queryset.filter(id_factura_id=factura_id)

        if estado:
            queryset = queryset.filter(estado__iexact=estado)

        if cliente_id:
            queryset = queryset.filter(
                id_factura__id_cliente_id=cliente_id
            )

        return queryset
