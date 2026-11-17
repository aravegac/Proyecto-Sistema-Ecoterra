from rest_framework import serializers

from .models import Proveedor


class ProveedorSerializer(serializers.ModelSerializer):
    estado = serializers.CharField(required=False, write_only=True, default="Activo")

    class Meta:
        model = Proveedor
        fields = [
            "id",
            "nombre_empresa",
            "pais",
            "contacto",
            "telefono",
            "email",
            "direccion",
            "estado",
        ]

    # Añade el estado Activo a los datos de salida del proveedor.
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["estado"] = "Activo"
        return data

    # Acepta únicamente los textos Activo e Inactivo como estado del proveedor.
    def validate_estado(self, value):
        if value not in ("Activo", "Inactivo"):
            raise serializers.ValidationError("Debe ser Activo o Inactivo.")
        return value

    # Descarta el estado recibido y guarda el proveedor con los campos persistentes del modelo.
    def create(self, validated_data):
        validated_data.pop("estado", None)
        return super().create(validated_data)

    # Descarta el estado recibido y actualiza los campos persistentes del proveedor.
    def update(self, instance, validated_data):
        validated_data.pop("estado", None)
        return super().update(instance, validated_data)