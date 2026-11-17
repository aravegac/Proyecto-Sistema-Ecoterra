# backend/usuarios/views.py
from django.db import connection
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
    
    def update(self, request, *args, **kwargs):
        print("Datos recibidos para actualizar:", request.data)
        if "contrasena" in request.data:
            print("Contraseña recibida:", request.data["contrasena"])
        return super().update(request, *args, **kwargs)


#  NUEVO ENDPOINT FUNCIONAL PARA PERMISOS PERSONALIZADOS
@api_view(["PUT"])
def usuario_permisos(request, pk):
    """Actualiza los permisos personalizados de un usuario específico."""
    # Verificar que el usuario solicitante sea admin
    if request.user.id_rol != 1:
        return Response(
            {"detail": "No tienes permiso para realizar esta acción."}, 
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        usuario = Usuario.objects.get(pk=pk)
    except Usuario.DoesNotExist:
        return Response(
            {"detail": "Usuario no encontrado."}, 
            status=status.HTTP_404_NOT_FOUND
        )

    # 👇 PRIMERO extraemos los datos
    data = request.data
    print(f"Body recibido completo para usuario {pk}: {data}")

    # Intentamos obtener los permisos del body
    permisos_data = data.get("permisos")
    
    # Si no viene en la clave "permisos", asumimos que el body ES el objeto de permisos
    if permisos_data is None and isinstance(data, dict):
        permisos_data = data

    if not isinstance(permisos_data, dict):
        return Response(
            {"detail": f"Formato inválido. Se esperaba un objeto JSON. Recibido: {data}"}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    usuario.permisos = permisos_data
    usuario.save(update_fields=["permisos"])

    print(f"Guardado en BD para usuario {pk}: {usuario.permisos}")

    return Response({"detail": "Permisos actualizados correctamente."}, status=status.HTTP_200_OK)


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
    
    if request.method == "GET":
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT p.id_permiso, p.nombre_permiso, p.modulo_permiso
                FROM rol_permiso rp
                INNER JOIN permiso p ON p.id_permiso = rp.id_permiso
                WHERE rp.id_rol = %s ORDER BY p.id_permiso
            """, [id_rol])
            rows = cursor.fetchall()
        return Response({"id_rol": id_rol, "permisos": [{"id": r[0], "nombre": r[1], "modulo": r[2]} for r in rows]})
        
    ids_permisos = request.data.get("permisos", [])
    try:
        ids_clean = sorted({int(i) for i in ids_permisos if i})
    except (TypeError, ValueError):
        return Response({"detail": "Todos los permisos deben ser IDs numéricos."}, status=400)

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rol_permiso WHERE id_rol = %s", [id_rol])
            for id_permiso in ids_clean:
                cursor.execute("""
                    INSERT INTO rol_permiso (id_rol, id_permiso)
                    VALUES (%s, %s) ON CONFLICT (id_rol, id_permiso) DO NOTHING
                """, [id_rol, id_permiso])

    return Response({"detail": "Permisos actualizados.", "total": len(ids_clean)})