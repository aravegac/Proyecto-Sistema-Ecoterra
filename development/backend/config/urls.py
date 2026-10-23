# backend/config/urls.py
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("clientes.urls")),
    path("api/", include("inventario.urls")),
    path("api/", include("proveedores.urls")),
    path("api/", include("usuarios.urls")),
    path("api/", include("cotizaciones.urls")),
    path("api/", include("facturacion.urls")),
    path("api/", include("ventas.urls")),
]