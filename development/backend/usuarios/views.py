# backend/usuarios/views.py
from rest_framework import status
from rest_framework.decorators import api_view, action
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Usuario
from .serializers import UsuarioSerializer
from .permissions import PermisoModulo, tiene_permiso
from django.db import connection, transaction


class UsuarioListView(ListCreateAPIView):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("usuarios_roles", "Consultar usuarios"),
        "POST": ("usuarios_roles", "Crear usuarios"),
    }


class UsuarioDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("usuarios_roles", "Consultar usuarios"),
        "PUT": ("usuarios_roles", "Editar usuarios"),
        "PATCH": ("usuarios_roles", "Editar usuarios"),
        "DELETE": ("usuarios_roles", "Eliminar usuarios"),
    }
    
# Permisos y rol del usuario se guardan juntos para evitar estados parciales.
@api_view(["GET", "PUT"])
def usuario_permisos(request, pk):
    if request.user.id_rol != 1:
        return Response({"detail": "No tienes permiso para realizar esta acción."}, status=403)
    with transaction.atomic():
        try:
            usuario = Usuario.objects.select_for_update().get(pk=pk)
        except Usuario.DoesNotExist:
            return Response({"detail": "Usuario no encontrado."}, status=404)
        if request.method == "PUT":
            if not isinstance(request.data, dict) or "permisos" not in request.data:
                return Response({"detail": "Se requiere el objeto permisos."}, status=400)
            payload = {"permisos": request.data["permisos"]}
            if "rol" in request.data:
                payload["rol"] = request.data["rol"]
            serializer = UsuarioSerializer(usuario, data=payload, partial=True, context={"request": request})
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return Response(UsuarioSerializer(usuario).data)


# ---------- Permisos Globales ----------

@api_view(["GET"])
def permisos_list(request):
    if not tiene_permiso(request.user, "usuarios_roles", "Administrar roles y permisos"):
        return Response({"detail": "No tienes permiso para consultar los permisos."}, status=status.HTTP_403_FORBIDDEN)
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT id_permiso, nombre_permiso, modulo_permiso, descripcion_permiso
            FROM permiso WHERE activo_permiso = TRUE ORDER BY id_permiso
        """)
        rows = cursor.fetchall()
    return Response([{"id": r[0], "nombre": r[1], "modulo": r[2], "descripcion": r[3]} for r in rows])


@api_view(["GET", "PUT"])
def rol_permisos(request, id_rol):
    if not tiene_permiso(request.user, "usuarios_roles", "Administrar roles y permisos"):
        return Response({"detail": "No tienes permiso para gestionar los permisos."}, status=status.HTTP_403_FORBIDDEN)
    
    if id_rol not in (1, 2, 3):
        return Response({"detail": "Rol inválido."}, status=404)
    if request.method == "GET":
        if id_rol == 1:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id_permiso, nombre_permiso, modulo_permiso FROM permiso WHERE activo_permiso = TRUE ORDER BY id_permiso")
                rows = cursor.fetchall()
            return Response({"id_rol": id_rol, "permisos": [{"id": r[0], "nombre": r[1], "modulo": r[2]} for r in rows]})
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT p.id_permiso, p.nombre_permiso, p.modulo_permiso
                FROM rol_permiso rp
                INNER JOIN permiso p ON p.id_permiso = rp.id_permiso
                WHERE rp.id_rol = %s AND p.activo_permiso = TRUE ORDER BY p.id_permiso
            """, [id_rol])
            rows = cursor.fetchall()
        return Response({"id_rol": id_rol, "permisos": [{"id": r[0], "nombre": r[1], "modulo": r[2]} for r in rows]})
        
    if id_rol == 1:
        return Response({"detail": "El administrador siempre tiene acceso total."}, status=400)
    if not isinstance(request.data, dict) or not isinstance(request.data.get("permisos"), list):
        return Response({"detail": "Se requiere una lista de permisos."}, status=400)
    ids_permisos = request.data["permisos"]
    if any(type(i) is not int or i <= 0 for i in ids_permisos):
        return Response({"detail": "Todos los permisos deben ser IDs numéricos."}, status=400)
    ids_clean = sorted(set(ids_permisos))
    with connection.cursor() as cursor:
        cursor.execute("SELECT id_permiso FROM permiso WHERE activo_permiso = TRUE")
        valid_ids = {row[0] for row in cursor.fetchall()}
    if not set(ids_clean).issubset(valid_ids):
        return Response({"detail": "Hay permisos inexistentes o inactivos."}, status=400)

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rol_permiso WHERE id_rol = %s", [id_rol])
            for id_permiso in ids_clean:
                cursor.execute("""
                    INSERT INTO rol_permiso (id_rol, id_permiso)
                    VALUES (%s, %s) ON CONFLICT (id_rol, id_permiso) DO NOTHING
                """, [id_rol, id_permiso])

    return Response({"detail": "Permisos actualizados.", "total": len(ids_clean)})