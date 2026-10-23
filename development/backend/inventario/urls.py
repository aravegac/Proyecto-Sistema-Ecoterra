# inventario/urls.py
from django.urls import path

from .views import (
    InventarioDetailView,
    InventarioListView,
    MovimientoListView,
    ProductoDetailView,
    ProductoListView,
)

urlpatterns = [
    path("productos/", ProductoListView.as_view(), name="productos-list"),
    path("productos/<int:pk>/", ProductoDetailView.as_view(), name="productos-detail"),
    path("inventario/", InventarioListView.as_view(), name="inventario-list"),
    path("inventario/<int:pk>/", InventarioDetailView.as_view(), name="inventario-detail"),
    path("movimientos/", MovimientoListView.as_view(), name="movimientos-list"),
]