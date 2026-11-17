# backend/usuarios/permissions.py
from django.db import connection
from rest_framework.permissions import BasePermission
from .models import Usuario


def tiene_permiso(usuario, modulo, nombre_permiso):
    if not isinstance(usuario, Usuario) or not usuario.activo:
        return False

    # El admin siempre tiene todo
    if usuario.id_rol == 1:
        return True

    # 1. Revisar si el usuario tiene permisos personalizados
    if usuario.permisos and isinstance(usuario.permisos, dict):
        clave = f"{modulo}:{nombre_permiso}"
        # Si la clave existe en el diccionario, respetamos su valor (True o False)
        if clave in usuario.permisos:
            return usuario.permisos[clave]

    # 2. Si no hay personalizado, revisar los globales del rol
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM rol_permiso rp
            INNER JOIN permiso p ON p.id_permiso = rp.id_permiso
            WHERE rp.id_rol = %s
              AND p.modulo_permiso = %s
              AND p.nombre_permiso = %s
              AND p.activo_permiso = TRUE
            LIMIT 1
            """,
            [usuario.id_rol, modulo, nombre_permiso],
        )
        return cursor.fetchone() is not None


class PermisoModulo(BasePermission):
    def has_permission(self, request, view):
        usuario = request.user

        if not isinstance(usuario, Usuario) or not usuario.activo:
            return False

        regla = getattr(view, "permisos_por_metodo", {}).get(request.method)

        if not regla:
            return False

        modulo, nombre_permiso = regla

        return tiene_permiso(usuario, modulo, nombre_permiso)