# backend/clientes/views.py
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.exceptions import NotFound

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


class DireccionListCreateView(ListCreateAPIView):
    serializer_class = DireccionSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("direcciones", "Consultar"),
        "POST": ("direcciones", "Crear"),
    }

    # Añade al contexto del serializer el cliente indicado en la URL.
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["cliente"] = Cliente.objects.get(pk=self.kwargs["cliente_id"])
        return context

    # Devuelve únicamente las direcciones del cliente indicado en la URL.
    def get_queryset(self):
        return Direccion.objects.filter(cliente_id=self.kwargs["cliente_id"])
    # Guarda la dirección vinculada al cliente de la URL o responde que el cliente no existe.
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

    # Limita la consulta, edición y eliminación de direcciones al cliente de la URL.
    def get_queryset(self):
        return Direccion.objects.filter(cliente_id=self.kwargs["cliente_id"])

