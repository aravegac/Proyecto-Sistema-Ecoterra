# backend/ventas/serializers.py
from rest_framework import serializers
from django.db import transaction
from cotizaciones.models import Cotizacion
from .models import OrdenCompra, NotaCredito
from decimal import Decimal


class OrdenCompraSerializer(serializers.ModelSerializer):
    archivo = serializers.FileField(write_only=True, required=False)
    factura_numero = serializers.CharField(source="factura.numero_factura", read_only=True, allow_null=True)
    cliente_nombre = serializers.CharField(
        source="id_cliente.razon_social",
        read_only=True,
    )
    cotizacion_numero = serializers.CharField(
        source="id_cotizacion.numero_cotizacion",
        read_only=True,
        allow_null=True,
    )
    cotizacion_detalle = serializers.SerializerMethodField()

    class Meta:
        model = OrdenCompra
        fields = [
            "id_oc",
            "id_cliente",
            "cliente_nombre",
            "id_cotizacion",
            "cotizacion_numero",
            "cotizacion_detalle",
            "numero_oc",
            "fecha_oc",
            "ruta_documento_oc",
            "tipo_operacion_oc",
            "archivo",
            "factura_numero",
        ]
        extra_kwargs = {"ruta_documento_oc": {"required": False, "allow_blank": True}}

    def validate_archivo(self, archivo):
        if archivo.size > 25 * 1024 * 1024:
            raise serializers.ValidationError("El PDF no puede superar 25 MB.")
        firma = archivo.read(5)
        archivo.seek(0)
        if firma != b"%PDF-":
            raise serializers.ValidationError("Selecciona un archivo PDF válido.")
        return archivo

    def validate(self, attrs):
        ruta = attrs.get("ruta_documento_oc", self.instance.ruta_documento_oc if self.instance else "")
        if not attrs.get("archivo") and not ruta:
            raise serializers.ValidationError({"archivo": "Adjunta el documento de la orden de compra."})
        return attrs

    # Devuelve un resumen de la cotización asociada a la orden o nulo cuando no existe.
    def get_cotizacion_detalle(self, obj):
        cotizacion = obj.id_cotizacion

        if not cotizacion:
            return None

        return {
            "id_cotizacion": cotizacion.id_cotizacion,
            "numero_cotizacion": cotizacion.numero_cotizacion,
            "fecha_cotizacion": cotizacion.fecha_cotizacion,
            "vigencia_cotizacion": cotizacion.vigencia_cotizacion,
            "total_cotizacion": cotizacion.total_cotizacion,
            "estado_cotizacion": cotizacion.estado_cotizacion,
        }

    # Exige una cotización aceptada del mismo cliente que no esté asociada a otra orden de compra.
    def validate_id_cotizacion(self, cotizacion):
        if cotizacion is None:
            return None

        cliente = self.initial_data.get("id_cliente")

        if cliente is None and self.instance:
            cliente = self.instance.id_cliente_id

        if cliente is None:
            raise serializers.ValidationError(
                "Debes indicar el cliente de la orden."
            )

        if str(cotizacion.id_cliente_id) != str(cliente):
            raise serializers.ValidationError(
                "La cotización pertenece a un cliente diferente."
            )

        if cotizacion.estado_actual != "Aceptada":
            raise serializers.ValidationError(
                "Solo se pueden asociar cotizaciones aceptadas."
            )

        ordenes_existentes = OrdenCompra.objects.filter(
            id_cotizacion=cotizacion
        )

        if self.instance:
            ordenes_existentes = ordenes_existentes.exclude(
                id_oc=self.instance.id_oc
            )

        if ordenes_existentes.exists():
            raise serializers.ValidationError(
                "Esta cotización ya está asociada a otra orden de compra."
            )

        return cotizacion

    def bloquear_y_validar_cotizacion(self, attrs):
        from facturacion.models import Factura

        if self.instance and Factura.objects.filter(id_orden_compra=self.instance).exists():
            cliente = attrs.get("id_cliente", self.instance.id_cliente)
            operacion = attrs.get("tipo_operacion_oc", self.instance.tipo_operacion_oc)
            if cliente.pk != self.instance.id_cliente_id or operacion != self.instance.tipo_operacion_oc:
                raise serializers.ValidationError("No se puede cambiar el cliente o tipo de operación de una orden facturada.")
        cotizacion = attrs.get("id_cotizacion", self.instance.id_cotizacion if self.instance else None)
        if cotizacion:
            cotizacion = Cotizacion.objects.select_for_update().get(pk=cotizacion.pk)
            self.validate_id_cotizacion(cotizacion)
            attrs["id_cotizacion"] = cotizacion

    @transaction.atomic
    def create(self, validated_data):
        self.bloquear_y_validar_cotizacion(validated_data)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        instance = OrdenCompra.objects.select_for_update().get(pk=instance.pk)
        self.instance = instance
        self.bloquear_y_validar_cotizacion(validated_data)
        return super().update(instance, validated_data)


class OrdenCompraFacturacionSerializer(OrdenCompraSerializer):
    """Alias de campos para la ruta histórica /orden-compras/."""

    id = serializers.IntegerField(source="id_oc", read_only=True)
    fecha_orden = serializers.DateField(source="fecha_oc")

    class Meta(OrdenCompraSerializer.Meta):
        fields = [
            "id", "id_cliente", "cliente_nombre", "id_cotizacion",
            "cotizacion_numero", "cotizacion_detalle", "numero_oc",
            "fecha_orden", "ruta_documento_oc",
            "tipo_operacion_oc", "archivo", "factura_numero",
        ]


class NotaCreditoSerializer(serializers.ModelSerializer):
    # Campos de solo lectura extraídos de la factura relacionada
    factura_numero = serializers.CharField(
        source="id_factura.numero_factura",
        read_only=True,
    )
    cliente_nombre = serializers.CharField(
        source="id_factura.id_cliente.razon_social",
        read_only=True,
    )
    cliente_id = serializers.IntegerField(
        source="id_factura.id_cliente.id",
        read_only=True,
    )
    factura_total = serializers.DecimalField(
        source="id_factura.total",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    # Campo de escritura: el usuario envía el subtotal bruto
    subtotal_bruto = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        write_only=True,
        required=True,
        min_value=Decimal("0.01"),
    )

    class Meta:
        model = NotaCredito
        fields = [
            "id",
            "id_factura",
            "factura_numero",
            "cliente_id",
            "cliente_nombre",
            "factura_total",
            "numero_nc",
            "fecha_emision",
            "subtotal",
            "iva",
            "total",
            "subtotal_bruto",
            "motivo",
            "estado",
            "ruta_pdf_nc",
            "creado_en",
        ]
        read_only_fields = [
            "id",
            "subtotal",
            "iva",
            "total",
            "ruta_pdf_nc",
            "creado_en",
        ]

    # Rechaza la creación de una nota de crédito cuando la factura asociada está anulada.
    def validate(self, attrs):
        factura = attrs.get("id_factura")
        subtotal_bruto = attrs.get("subtotal_bruto")

        if factura:
            # Validación de seguridad: no permitir NC sobre facturas anuladas
            if getattr(factura, "estado", "") == "ANULADA":
                raise serializers.ValidationError(
                    {
                        "id_factura": (
                            "No se puede crear una nota de crédito "
                            "sobre una factura anulada."
                        )
                    }
                )

        return attrs

    # Calcula los importes desde el subtotal bruto y guarda la nota de crédito.
    def create(self, validated_data):
        subtotal_bruto = validated_data.pop("subtotal_bruto")
        nota = NotaCredito(**validated_data)
        nota.calcular_totales(subtotal_bruto)
        nota.save()
        return nota
