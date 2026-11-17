# backend/usuarios/serializers.py
from django.contrib.auth.hashers import make_password
from rest_framework import serializers

from .models import Usuario
from .permissions import tiene_permiso

ROLE_LABEL_TO_ID = {
    "Superusuario / Admin": 1,
    "Usuario con privilegios": 2,
    "Usuario base": 3,
}
ROLE_ID_TO_LABEL = {value: key for key, value in ROLE_LABEL_TO_ID.items()}


class RolUsuarioField(serializers.Field):
    def to_representation(self, value):
        return ROLE_ID_TO_LABEL.get(int(value), "Usuario base")

    def to_internal_value(self, value):
        if isinstance(value, int) and not isinstance(value, bool):
            if value in ROLE_ID_TO_LABEL:
                return value
            raise serializers.ValidationError("Rol inválido.")
        if not isinstance(value, str):
            raise serializers.ValidationError("El rol debe ser texto.")
        role_id = ROLE_LABEL_TO_ID.get(value.strip())
        if role_id is None:
            raise serializers.ValidationError("Rol inválido.")
        return role_id


class EstadoUsuarioField(serializers.Field):
    def to_representation(self, value):
        return "Activo" if value else "Inactivo"

    def to_internal_value(self, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in {"activo", "inactivo"}:
            return value.lower() == "activo"
        raise serializers.ValidationError("El estado debe ser Activo o Inactivo.")


class UsuarioSerializer(serializers.ModelSerializer):
    rol = RolUsuarioField(source="id_rol")
    estado = EstadoUsuarioField(source="activo")
    contrasena = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    # Ahora 'permisos' es un campo que se lee y se escribe
    permisos = serializers.JSONField(required=False)

    def validate(self, attrs):
        request = self.context.get("request")
        usuario_solicitante = getattr(request, "user", None)

        modifica_rol = "id_rol" in attrs
        modifica_estado = "activo" in attrs

        if modifica_rol or modifica_estado:
            if not tiene_permiso(
                usuario_solicitante,
                "usuarios_roles",
                "Administrar roles y permisos",
            ):
                raise serializers.ValidationError({
                    "detail": (
                        "No tienes permiso para cambiar roles "
                        "o el estado de los usuarios."
                    )
                })
        return attrs

    def validate_permisos(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Los permisos deben ser un objeto JSON.")
        return value

    def create(self, validated_data):
        # 👇 Ya no borramos los permisos
        raw_password = validated_data.pop("contrasena", "") or "temporal"
        validated_data["contrasena"] = make_password(raw_password)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # 👇 Ya no borramos los permisos
        raw_password = validated_data.pop("contrasena", None)
        if raw_password:
            validated_data["contrasena"] = make_password(raw_password)
        return super().update(instance, validated_data)

    class Meta:
        model = Usuario
        fields = [
            "id",
            "nombre",
            "email",
            "rol",
            "estado",
            "contrasena",
            "permisos",
        ]