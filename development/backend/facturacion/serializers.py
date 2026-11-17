from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from rest_framework import serializers

from .models import Factura, DetalleFactura
from ventas.models import OrdenCompra
from ventas.serializers import OrdenCompraFacturacionSerializer as OrdenCompraSerializer
from clientes.models import Cliente
from clientes.serializers import DireccionSerializer
from inventario.models import Producto


class DetalleFacturaEntradaSerializer(serializers.Serializer):
    id_producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.all()
    )
    cantidad = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    precio_unitario = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )



class DetalleFacturaSerializer(serializers.ModelSerializer):
    producto_codigo = serializers.CharField(source="id_producto.codigo", read_only=True)
    producto_unidad = serializers.CharField(source="id_producto.unidad", read_only=True)
    producto_nombre = serializers.CharField(
        source="id_producto.nombre",
        read_only=True,
        default="",
    )

    class Meta:
        model = DetalleFactura
        fields = [
            "id",
            "id_factura",
            "id_producto",
            "producto_nombre",
            "producto_codigo",
            "producto_unidad",
            "descripcion_df",
            "cantidad",
            "precio_unitario",
            "subtotal_df",
        ]
        read_only_fields = ["id", "subtotal_df"]



class FacturaSerializer(serializers.ModelSerializer):
    tipo_operacion = serializers.CharField(read_only=True)
    cliente_rut = serializers.CharField(source="id_cliente.rut", read_only=True)
    cliente_telefono = serializers.CharField(source="id_cliente.telefono", read_only=True)
    cliente_email = serializers.CharField(source="id_cliente.email", read_only=True)
    cliente_representante = serializers.CharField(source="id_cliente.representante", read_only=True)
    cliente_pais = serializers.CharField(source="id_cliente.pais", read_only=True)
    cliente_region = serializers.CharField(source="id_cliente.region", read_only=True)
    cliente_ciudad = serializers.CharField(source="id_cliente.ciudad", read_only=True)
    cliente_direcciones = DireccionSerializer(source="id_cliente.direcciones", many=True, read_only=True)
    cliente_id = serializers.PrimaryKeyRelatedField(
        queryset=Cliente.objects.all(),
        source="id_cliente",
        required=False,
    )

    id_cliente = serializers.PrimaryKeyRelatedField(
        queryset=Cliente.objects.all(),
        write_only=True,
        required=False,
    )

    id_orden_compra = serializers.PrimaryKeyRelatedField(
        queryset=OrdenCompra.objects.all(),
        write_only=True,
        required=False,
    )

    id_oc = serializers.PrimaryKeyRelatedField(
        queryset=OrdenCompra.objects.all(),
        source="id_orden_compra",
        required=False,
    )

    detalles = DetalleFacturaEntradaSerializer(
        many=True,
        write_only=True,
        required=False,
    )

    detalles_factura = DetalleFacturaSerializer(
        source="detalles",
        many=True,
        read_only=True,
    )

    cliente_nombre = serializers.CharField(
        source="id_cliente.razon_social",
        read_only=True,
        default="",
    )

    oc_numero = serializers.SerializerMethodField()

    fecha_factura = serializers.DateField(
        source="fecha_emision",
        read_only=True,
    )

    subtotal_factura = serializers.DecimalField(
        source="subtotal",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    iva_factura = serializers.DecimalField(
        source="iva",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    total_factura = serializers.DecimalField(
        source="total",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    estado_factura = serializers.CharField(
        source="estado",
        read_only=True,
    )

    ruta_pdf_factura = serializers.CharField(
        read_only=True,
    )

    class Meta:
        model = Factura
        fields = [
            "id",
            "numero_factura",
            "cliente_id",
            "id_cliente",
            "cliente_nombre",
            "cliente_rut", "cliente_telefono", "cliente_email", "cliente_representante",
            "cliente_pais", "cliente_region", "cliente_ciudad", "cliente_direcciones",
            "id_orden_compra",
            "id_oc",
            "oc_numero",
            "fecha_emision",
            "fecha_factura",
            "subtotal",
            "subtotal_factura",
            "iva",
            "iva_factura",
            "total",
            "total_factura",
            "estado",
            "estado_factura",
            "ruta_pdf_factura",
            "observacion_factura",
            "moneda_factura",
            "tipo_operacion",
            "fecha_anulacion_factura", "motivo_anulacion_factura", "id_usuario_anulacion_factura",
            "fecha_pago_factura", "id_usuario_pago_factura",
            "detalles",
            "detalles_factura",
        ]
        read_only_fields = [
            "id",
            "numero_factura",
            "fecha_emision",
            "subtotal",
            "iva",
            "total",
            "estado",
            "fecha_anulacion_factura", "motivo_anulacion_factura", "id_usuario_anulacion_factura",
            "fecha_pago_factura", "id_usuario_pago_factura",
        ]

    # Obtiene el número de la orden asociada a la factura usando su identificador como alternativa.
    def get_oc_numero(self, obj):
        orden = obj.id_orden_compra
        return (
            getattr(orden, "numero_oc", None)
            or getattr(orden, "id_oc", None)
            or orden.pk
        )

    # Normaliza los alias de cliente, orden y producto antes de validar los datos de la factura.
    def to_internal_value(self, data):
        data = data.copy()

        if not data.get("cliente_id") and data.get("id_cliente"):
            data["cliente_id"] = data["id_cliente"]

        if not data.get("id_orden_compra") and data.get("id_oc"):
            data["id_orden_compra"] = data["id_oc"]

        # Admite producto_id, además de id_producto, en cada detalle.
        detalles = data.get("detalles")
        if detalles:
            detalles = [
                {
                    **detalle,
                    "id_producto": (
                        detalle.get("id_producto")
                        or detalle.get("producto_id")
                    ),
                }
                for detalle in detalles
            ]
            data["detalles"] = detalles

        return super().to_internal_value(data)

    # Exige cliente, orden y productos, comprueba su coherencia y rechaza órdenes facturadas o productos repetidos.
    def validate(self, attrs):
        if self.instance and self.instance.estado != "PENDIENTE":
            raise serializers.ValidationError("Solo se pueden editar facturas pendientes.")
        if self.instance and ("estado" in self.initial_data or "estado_factura" in self.initial_data):
            raise serializers.ValidationError({"estado": "Usa las acciones Emitir, Marcar pagada o Anular."})
        if self.instance and self.instance.notas_credito.exists():
            orden = attrs.get("id_orden_compra", self.instance.id_orden_compra)
            moneda = attrs.get("moneda_factura", self.instance.moneda_factura)
            if orden.pk != self.instance.id_orden_compra_id or moneda != self.instance.moneda_factura:
                raise serializers.ValidationError("Una factura con notas de crédito conserva su moneda y orden de origen.")
        cliente = attrs.get("id_cliente", getattr(self.instance, "id_cliente", None))
        orden = attrs.get("id_orden_compra", getattr(self.instance, "id_orden_compra", None))
        detalles = attrs.get("detalles")

        if cliente is None:
            raise serializers.ValidationError({
                "cliente_id": "Debes indicar el cliente."
            })

        if orden is None:
            raise serializers.ValidationError({
                "id_oc": "Debes indicar la orden de compra."
            })

        if detalles == [] or (self.instance is None and not detalles):
            raise serializers.ValidationError({
                "detalles": "Debes agregar al menos un producto."
            })

        cliente_orden_id = getattr(orden, "id_cliente_id", None)

        if cliente_orden_id != cliente.pk:
            raise serializers.ValidationError({
                "cliente_id": (
                    "El cliente seleccionado no corresponde "
                    "a la orden de compra."
                )
            })

        self.validar_orden_disponible(orden)

        ids_productos = [
            detalle["id_producto"].pk
            for detalle in (detalles or [])
        ]

        if len(ids_productos) != len(set(ids_productos)):
            raise serializers.ValidationError({
                "detalles": (
                    "No puedes repetir un producto en la misma factura."
                )
            })

        return attrs

    # Rechaza una orden asociada a otra factura excluyendo la factura que se está editando.
    def validar_orden_disponible(self, orden):
        if orden.id_cotizacion_id and orden.id_cotizacion.estado_actual != "Aceptada":
            raise serializers.ValidationError({
                "id_oc": "La cotización de origen debe estar aceptada para generar operaciones comerciales."
            })
        facturas = Factura.objects.filter(id_orden_compra=orden)
        if self.instance is not None:
            facturas = facturas.exclude(pk=self.instance.pk)
        if facturas.exists():
            raise serializers.ValidationError({
                "id_oc": "Esta orden de compra ya tiene una factura asociada."
            })

    # Guarda los productos de la factura con descripción, cantidades, precios y subtotales redondeados.
    def guardar_detalles(self, factura, detalles):
        for detalle in detalles:
            DetalleFactura.objects.create(
                id_factura=factura,
                id_producto=detalle["id_producto"],
                descripcion_df=detalle["id_producto"].nombre[:200],
                cantidad=detalle["cantidad"],
                precio_unitario=detalle["precio_unitario"],
                subtotal_df=(detalle["cantidad"] * detalle["precio_unitario"]).quantize(Decimal("0.01")),
            )

    # Bloquea la orden y crea atómicamente la factura, su número definitivo, sus detalles y sus totales.
    @transaction.atomic
    def create(self, validated_data):
        detalles_data = validated_data.pop("detalles", [])
        orden = OrdenCompra.objects.select_for_update().get(pk=validated_data["id_orden_compra"].pk)
        self.validar_orden_disponible(orden)
        if orden.id_cliente_id != validated_data["id_cliente"].pk:
            raise serializers.ValidationError({"cliente_id": "La orden de compra cambió de cliente. Vuelve a seleccionarla."})
        validated_data["id_orden_compra"] = orden

        validated_data["ruta_pdf_factura"] = (
            validated_data.get("ruta_pdf_factura") or ""
        )

        factura = Factura.objects.create(
            numero_factura=f"TMP-{uuid4().hex[:20]}",
            subtotal=Decimal("0.00"),
            iva=Decimal("0.00"),
            total=Decimal("0.00"),
            **validated_data,
        )

        numero = f"F-{factura.pk:05d}"

        if Factura.objects.filter(
            numero_factura=numero
        ).exclude(pk=factura.pk).exists():
            numero = f"{numero}-{uuid4().hex[:6].upper()}"

        factura.numero_factura = numero
        factura.save(update_fields=["numero_factura"])

        self.guardar_detalles(factura, detalles_data)
        factura.recalcular_totales()
        factura.refresh_from_db()
        return factura

    # Bloquea orden y factura, actualiza sus datos y detalles, invalida el PDF y recalcula los totales atómicamente.
    @transaction.atomic
    def update(self, instance, validated_data):
        detalles = validated_data.pop("detalles", None)
        orden = validated_data.get("id_orden_compra", instance.id_orden_compra)
        orden = OrdenCompra.objects.select_for_update().get(pk=orden.pk)
        self.validar_orden_disponible(orden)
        factura = Factura.objects.select_for_update().get(pk=instance.pk)
        if factura.estado != "PENDIENTE":
            raise serializers.ValidationError("Solo se pueden editar facturas pendientes.")
        cliente = validated_data.get("id_cliente", factura.id_cliente)
        if orden.id_cliente_id != cliente.pk:
            raise serializers.ValidationError({"cliente_id": "La orden de compra cambió de cliente. Vuelve a seleccionarla."})
        validated_data["id_orden_compra"] = orden
        for field, value in validated_data.items():
            setattr(factura, field, value)
        factura.ruta_pdf_factura = ""
        factura.save()
        if detalles is not None:
            factura.detalles.all().delete()
            self.guardar_detalles(factura, detalles)
        factura.recalcular_totales()
        factura.refresh_from_db()
        return factura
