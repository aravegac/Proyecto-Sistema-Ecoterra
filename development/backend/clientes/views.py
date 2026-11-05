# backend/clientes/views.py
from django.db import IntegrityError
from django.db.models import ProtectedError, RestrictedError
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework import status

from .models import Cliente, Direccion
from .serializers import ClienteSerializer, DireccionSerializer
from usuarios.permissions import PermisoModulo


class ClienteListView(ListCreateAPIView):
    queryset = Cliente.objects.all().prefetch_related("direcciones")
    serializer_class = ClienteSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("clientes", "Consultar"),
        "POST": ("clientes", "Crear"),
    }


class ClienteDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Cliente.objects.all().prefetch_related("direcciones")
    serializer_class = ClienteSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("clientes", "Consultar"),
        "PUT": ("clientes", "Editar"),
        "PATCH": ("clientes", "Editar"),
        "DELETE": ("clientes", "Eliminar"),
    }

    #  CAPTURAMOS TODOS LOS POSIBLES ERRORES DE INTEGRIDAD
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except (IntegrityError, ProtectedError, RestrictedError, ValidationError) as e:
            return Response(
                {"error": "No se pudo eliminar cliente: Ya está asociado a documentos existentes."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class DireccionListCreateView(ListCreateAPIView):
    serializer_class = DireccionSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("direcciones", "Consultar"),
        "POST": ("direcciones", "Crear"),
    }

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["cliente"] = Cliente.objects.get(pk=self.kwargs["cliente_id"])
        return context

    def get_queryset(self):
        return Direccion.objects.filter(cliente_id=self.kwargs["cliente_id"])

    def perform_create(self, serializer):
        try:
            cliente = Cliente.objects.get(pk=self.kwargs["cliente_id"])
        except Cliente.DoesNotExist as error:
            raise NotFound("Cliente no encontrado") from error
        serializer.save(cliente=cliente)


class DireccionDetailView(RetrieveUpdateDestroyAPIView):
    serializer_class = DireccionSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("direcciones", "Consultar"),
        "PUT": ("direcciones", "Editar"),
        "PATCH": ("direcciones", "Editar"),
        "DELETE": ("direcciones", "Eliminar"),
    }

    def get_queryset(self):
        return Direccion.objects.filter(cliente_id=self.kwargs["cliente_id"])