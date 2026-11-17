# clientes/serializers.py
import re

from rest_framework import serializers

from .models import Cliente, Direccion


# Limpia el RUT, comprueba su dígito verificador y devuelve el formato cuerpo-guion-verificador.
def normalize_rut(value):
    cleaned = re.sub(r"[.\s-]", "", value).upper()
    if not re.fullmatch(r"\d{7,8}[0-9K]", cleaned):
        raise serializers.ValidationError("Ingresa un RUT chileno válido.")

    body, verifier = cleaned[:-1], cleaned[-1]
    total = 0
    factor = 2
    for digit in reversed(body):
        total += int(digit) * factor
        factor = 2 if factor == 7 else factor + 1

    remainder = 11 - (total % 11)
    expected = "0" if remainder == 11 else "K" if remainder == 10 else str(remainder)
    if verifier != expected:
        raise serializers.ValidationError("Ingresa un RUT chileno válido.")

    return f"{body}-{verifier}"


class EstadoClienteField(serializers.Field):
    # Convierte el estado booleano del cliente en Activo o Inactivo.
    def to_representation(self, value):
        return "Activo" if value else "Inactivo"

    # Convierte un booleano o el texto Activo/Inactivo en el estado booleano del cliente.
    def to_internal_value(self, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in {"activo", "inactivo"}:
            return value.lower() == "activo"
        raise serializers.ValidationError("El estado debe ser Activo o Inactivo.")


class DireccionSerializer(serializers.ModelSerializer):
    # Impide asignar una segunda dirección principal al mismo cliente.
    def validate(self, attrs):
        cliente = self.instance.cliente if self.instance else self.context.get("cliente")
        principal = attrs.get("principal", self.instance.principal if self.instance else False)

        if cliente and principal:
            existing = Direccion.objects.filter(cliente=cliente, principal=True)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    {"principal": "Este cliente ya tiene una dirección principal."}
                )

        return attrs

    class Meta:
        model = Direccion
        fields = [
            "id",
            "nombre",
            "calle",
            "ciudad",
            "region",
            "pais",
            "codigo_postal",
            "tipo",
            "contacto_recepcion",
            "telefono_contacto",
            "instrucciones_entrega",
            "principal",
        ]


class ClienteSerializer(serializers.ModelSerializer):
    direcciones = DireccionSerializer(many=True, read_only=True)
    estado = EstadoClienteField(required=False, default=True)

    # Valida y normaliza el RUT del cliente antes de guardarlo.
    def validate_rut(self, value):
        return normalize_rut(value)

    class Meta:
        model = Cliente
        fields = [
            "id",
            "rut",
            "razon_social",
            "nombre_fantasia",
            "ciudad",
            "telefono",
            "email",
            "representante",
            "estado",
            "direcciones",
        ]

