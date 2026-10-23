# inventario/serializers.py
import random
import string

from django.db.models import (
    Sum,
    Case,
    When,
    Value,
    DecimalField,
)
from django.db.models.functions import Coalesce
from rest_framework import serializers

from .models import Inventario, Movimiento, Producto


CAPACIDAD_ENVASE = {"Tambor 200 L": 200, "IBC 1000 L": 1000}


class InventarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inventario
        fields = [
            "id",
            "id_producto",
            "codigo_lote",
            "cantidad",
            "tipo_envase",
            "fecha_fabricacion",
            "fecha_vencimiento",
            "ubicacion",
            "estado",
        ]

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None))

        if self.instance and "cantidad" in attrs:
            raise serializers.ValidationError({"cantidad": "Modifica el stock desde Movimientos."})

        fabricacion = value("fecha_fabricacion")
        vencimiento = value("fecha_vencimiento")
        if fabricacion and vencimiento and vencimiento < fabricacion:
            raise serializers.ValidationError({
                "fecha_vencimiento": "El vencimiento no puede ser anterior a la fabricación."
            })

        capacidad = CAPACIDAD_ENVASE.get(value("tipo_envase"))
        cantidad = value("cantidad")
        if capacidad is not None and cantidad is not None and cantidad > capacidad:
            raise serializers.ValidationError({
                "cantidad": f"La cantidad no puede superar {capacidad} L para este envase."
            })
        return attrs

    # Genera un código de lote aleatorio si falta y guarda el registro de inventario.
    def create(self, validated_data):
        if not validated_data.get("codigo_lote"):
            suffix = "".join(random.choices(string.digits, k=4))
            validated_data["codigo_lote"] = f"LOTE-{suffix}"
        return super().create(validated_data)


class MovimientoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movimiento
        fields = [
            "id",
            "id_inventario",
            "id_usuario",
            "tipo_movimiento",
            "cantidad_movimiento",
            "fecha_movimiento",
            "referencia",
            "observacion",
            "stock_anterior",
            "stock_posterior",
        ]


class ProductoSerializer(serializers.ModelSerializer):
    stock_disponible = serializers.SerializerMethodField()
    stock_total = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = [
            "id",
            "codigo",
            "nombre",
            "descripcion",
            "tipo",
            "unidad",
            "stock_minimo",
            "stock_disponible",
            "stock_total",
            "estado",
        ]

    # Devuelve como número el stock disponible calculado o cero si no hay existencias.
    def get_stock_disponible(self, obj):
        return float(getattr(obj, "stock_disponible_calculado", 0) or 0)

    # Devuelve como número el stock total calculado o cero si no hay existencias.
    def get_stock_total(self, obj):
        return float(getattr(obj, "stock_total_calculado", 0) or 0)