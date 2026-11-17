from django.shortcuts import render

# Create your views here.
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView

from .models import Proveedor
from .serializers import ProveedorSerializer
from usuarios.permissions import PermisoModulo


class ProveedorListView(ListCreateAPIView):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("proveedores", "Consultar"),
    "POST": ("proveedores", "Crear"),
    }


class ProveedorDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
    "GET": ("proveedores", "Consultar"),
    "PUT": ("proveedores", "Editar"),
    "PATCH": ("proveedores", "Editar"),
    "DELETE": ("proveedores", "Eliminar"),
    }