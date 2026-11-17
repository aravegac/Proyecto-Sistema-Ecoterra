from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from rest_framework import serializers
from clientes.serializers import RutDocumentoField
from .models import Cotizacion, DetalleCotizacion


class DetalleCotizacionSerializer(serializers.ModelSerializer):
    codigo_producto = serializers.CharField(source="id_producto.codigo", read_only=True)
    nombre_producto = serializers.CharField(source="id_producto.nombre", read_only=True)
    unidad_producto = serializers.CharField(source="id_producto.unidad", read_only=True)

    class Meta:
        model = DetalleCotizacion
        fields = [
            "id_producto",
            "codigo_producto",
            "nombre_producto",
            "unidad_producto",
            "descripcion_dc",
            "cantidad_dc",
            "precio_unitario_dc",
            "subtotal_dc",
        ]
        read_only_fields = ["subtotal_dc"]


class CotizacionSerializer(serializers.ModelSerializer):
    detalles = DetalleCotizacionSerializer(many=True, write_only=True)
    
    cliente_nombre = serializers.CharField(source="id_cliente.razon_social", read_only=True)
    cliente_rut = RutDocumentoField(source="id_cliente.rut", read_only=True)
    cliente_telefono = serializers.CharField(source="id_cliente.telefono", read_only=True)
    cliente_email = serializers.CharField(source="id_cliente.email", read_only=True)
    cliente_representante = serializers.CharField(source="id_cliente.representante", read_only=True)
    cliente_pais = serializers.CharField(source="id_cliente.pais", read_only=True)
    cliente_region = serializers.CharField(source="id_cliente.region", read_only=True)
    cliente_ciudad = serializers.CharField(source="id_cliente.ciudad", read_only=True)
    
    cliente_direcciones = serializers.SerializerMethodField()

    class Meta:
        model = Cotizacion
        fields = [
            "id_cotizacion",
            "id_cliente",
            "cliente_nombre",
            "cliente_rut",
            "cliente_telefono",
            "cliente_email",
            "cliente_representante",
            "cliente_pais",
            "cliente_region",
            "cliente_ciudad",
            "cliente_direcciones",
            "numero_cotizacion",
            "fecha_cotizacion",
            "dias_vigencia_cotizacion",
            "vigencia_cotizacion",
            "condicion_pago_cotizacion",
            "tipo_operacion_cotizacion",
            "subtotal_cotizacion",
            "iva_cotizacion",
            "total_cotizacion",
            "moneda",
            "observacion_cotizacion",
            "estado_cotizacion",
            "ruta_pdf_cotizacion",
            "fecha_anulacion",
            "motivo_anulacion",
            "id_usuario_anulacion",
            "detalles",
        ]
        read_only_fields = [
            "id_cotizacion", "numero_cotizacion", "ruta_pdf_cotizacion",
            "subtotal_cotizacion", "iva_cotizacion", "total_cotizacion",
            "fecha_anulacion", "motivo_anulacion", "id_usuario_anulacion",
        ]

    def validate(self, attrs):
        estado = attrs.get("estado_cotizacion", self.instance.estado_actual if self.instance else "Borrador")
        if estado not in Cotizacion.ESTADOS:
            raise serializers.ValidationError({"estado_cotizacion": "Estado de cotización inválido."})
        if estado == "Anulada":
            raise serializers.ValidationError({"estado_cotizacion": "Usa la acción Anular cotización para registrar el motivo y responsable."})
        if self.instance:
            actual = self.instance.estado_actual
            transiciones = {
                "Borrador": {"Borrador", "Vigente"},
                "Vigente": {"Vigente", "Vencida", "Aceptada", "Rechazada"},
            }
            if estado not in transiciones.get(actual, set()):
                raise serializers.ValidationError({"estado_cotizacion": "El estado actual no permite esta edición o transición."})
        attrs["estado_cotizacion"] = estado
        detalles = attrs.get("detalles")
        if detalles is None and self.instance:
            detalles = list(self.instance.detallecotizacion_set.values(
                "cantidad_dc", "precio_unitario_dc"
            ))
        detalles = detalles or []
        subtotal = Decimal("0")
        for detalle in detalles:
            cantidad = detalle["cantidad_dc"]
            precio = detalle["precio_unitario_dc"]
            if cantidad <= 0 or precio < 0:
                raise serializers.ValidationError({
                    "detalles": "La cantidad debe ser positiva y el precio no puede ser negativo."
                })
            importe = (cantidad * precio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            detalle["subtotal_dc"] = importe
            subtotal += importe
        operacion = attrs.get(
            "tipo_operacion_cotizacion",
            self.instance.tipo_operacion_cotizacion if self.instance else "Nacional",
        )
        tasa = Decimal("0.19") if operacion == "Nacional" else Decimal("0")
        iva = (subtotal * tasa).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total = subtotal + iva
        if total > Decimal("9999999999.99"):
            raise serializers.ValidationError({"detalles": "El total supera el importe máximo permitido."})
        attrs.update(subtotal_cotizacion=subtotal, iva_cotizacion=iva, total_cotizacion=total)
        return attrs

    # Devuelve los datos de las direcciones del cliente asociado a la cotización.
    def get_cliente_direcciones(self, obj):
        direcciones = obj.id_cliente.direcciones.all()
        return [
            {
                "id": d.id,
                "nombre": d.nombre,
                "calle": d.calle,
                "ciudad": d.ciudad,
                "region": d.region,
                "pais": d.pais,
                "principal": d.principal,
            }
            for d in direcciones
        ]

    # Genera el número de cotización y guarda su cabecera junto con sus detalles.
    @transaction.atomic
    def create(self, validated_data):
        detalles_data = validated_data.pop("detalles", [])
        ultimo = Cotizacion.objects.order_by("-id_cotizacion").first()
        siguiente_numero = (ultimo.id_cotizacion + 1) if ultimo else 1
        validated_data["numero_cotizacion"] = f"COT-{siguiente_numero:04d}"
        validated_data.setdefault("ruta_pdf_cotizacion", "")

        cotizacion = Cotizacion.objects.create(**validated_data)

        for detalle_data in detalles_data:
            DetalleCotizacion.objects.create(id_cotizacion=cotizacion, **detalle_data)

        return cotizacion

    # Actualiza la cabecera de la cotización y reemplaza sus detalles cuando se envían.
    @transaction.atomic
    def update(self, instance, validated_data):
        """
        Permite actualizar la cotización y reemplazar sus detalles (productos).
        """
        detalles_data = validated_data.pop("detalles", None)

        # 1. Actualizar los campos de la cabecera
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # 2. Si vienen detalles, borramos los anteriores y creamos los nuevos
        if detalles_data is not None:
            DetalleCotizacion.objects.filter(id_cotizacion=instance).delete()
            for detalle_data in detalles_data:
                DetalleCotizacion.objects.create(id_cotizacion=instance, **detalle_data)

        return instance

    # Añade los detalles de productos a la representación de salida de la cotización.
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["estado_cotizacion"] = instance.estado_actual
        data["detalles"] = DetalleCotizacionSerializer(
            instance.detallecotizacion_set.all(), many=True
        ).data
        return data
