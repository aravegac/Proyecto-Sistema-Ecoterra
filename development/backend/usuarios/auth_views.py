# backend/usuarios/auth_views.py

from django.contrib.auth.hashers import check_password
from django.db import connection

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Usuario
from .serializers import ROLE_ID_TO_LABEL
from .authentication import crear_token


# Consulta los permisos activos del rol y los devuelve como claves modulo:accion con valor verdadero.
def _cargar_permisos(id_rol):
    """Devuelve un dict { 'modulo:accion': True } con los permisos del rol."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.modulo_permiso, p.nombre_permiso
            FROM rol_permiso rp
            INNER JOIN permiso p ON p.id_permiso = rp.id_permiso
            WHERE rp.id_rol = %s AND p.activo_permiso = TRUE
            """,
            [id_rol],
        )
        return {f"{modulo}:{nombre}": True for modulo, nombre in cursor.fetchall()}


# Valida correo, contraseña y estado del usuario y devuelve su sesión con rol, permisos y token firmado.
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response(
            {"detail": "Correo y contraseña son obligatorios."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        usuario = Usuario.objects.get(email__iexact=email)
    except Usuario.DoesNotExist:
        return Response(
            {"detail": "Credenciales inválidas."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    #  CAMBIO: verificar con check_password (soporta hash)
    if not check_password(password, usuario.contrasena):
        return Response(
            {"detail": "Credenciales inválidas."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not usuario.activo:
        return Response(
            {"detail": "Usuario inactivo. Contacta al administrador."},
            status=status.HTTP_403_FORBIDDEN,
        )

    permisos = _cargar_permisos(usuario.id_rol)
    token = crear_token(usuario)

    return Response({
        "id": usuario.id,
        "nombre": usuario.nombre,
        "email": usuario.email,
        "rol": ROLE_ID_TO_LABEL.get(usuario.id_rol, "Usuario base"),
        "id_rol": usuario.id_rol,
        "estado": "Activo" if usuario.activo else "Inactivo",
        "permisos": permisos,
        "token": token,
    }, status=status.HTTP_200_OK)