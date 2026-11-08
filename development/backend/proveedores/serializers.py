# proveedores/serializers.py
from rest_framework import serializers

from .models import Proveedor


class EstadoProveedorField(serializers.Field):
    # Convierte el estado booleano del proveedor en Activo o Inactivo.
    def to_representation(self, value):
        return "Activo" if value else "Inactivo"

    # Acepta un booleano o los textos Activo e Inactivo y los guarda como booleano.
    def to_internal_value(self, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value in ("Activo", "Inactivo"):
            return value == "Activo"
        raise serializers.ValidationError("Debe ser Activo o Inactivo.")


class ProveedorSerializer(serializers.ModelSerializer):
    estado = EstadoProveedorField(required=False, default=True)

    class Meta:
        model = Proveedor
        fields = [
            "id",
            "nombre_empresa",
            "pais",
            "contacto",
            "telefono",
            "email",
            # "direccion",
            "estado",
        ]
