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
        return float(obj.stock_disponible_calculado or 0)

    # Devuelve como número el stock total calculado o cero si no hay existencias.
    def get_stock_total(self, obj):
        return float(obj.stock_total_calculado or 0)