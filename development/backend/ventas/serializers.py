# backend/ventas/serializers.py
from rest_framework import serializers
from .models import OrdenCompra, NotaCredito
from decimal import Decimal


class OrdenCompraSerializer(serializers.ModelSerializer):
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
        ]

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

    # Exige una cotización vigente del mismo cliente que no esté asociada a otra orden de compra.
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

        if cotizacion.estado_cotizacion != "Vigente":
            raise serializers.ValidationError(
                "Solo se pueden asociar cotizaciones en estado Vigente."
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


class OrdenCompraFacturacionSerializer(OrdenCompraSerializer):
    """Alias de campos para la ruta histórica /orden-compras/."""

    id = serializers.IntegerField(source="id_oc", read_only=True)
    fecha_orden = serializers.DateField(source="fecha_oc")

    class Meta(OrdenCompraSerializer.Meta):
        fields = [
            "id", "id_cliente", "cliente_nombre", "id_cotizacion",
            "cotizacion_numero", "cotizacion_detalle", "numero_oc",
            "fecha_orden", "ruta_documento_oc",
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