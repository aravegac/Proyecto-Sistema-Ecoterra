# backend/clientes/urls.py
from django.urls import path

from .views import (
    ClienteDetailView,
    ClienteListView,
    DireccionDetailView,
    DireccionListCreateView,
)

urlpatterns = [
    path("clientes/", ClienteListView.as_view(), name="clientes-list"),
    path("clientes/<int:pk>/", ClienteDetailView.as_view(), name="clientes-detail"),
    path(
        "clientes/<int:cliente_id>/direcciones/",
        DireccionListCreateView.as_view(),
        name="direcciones-list",
    ),
    path(
        "clientes/<int:cliente_id>/direcciones/<int:pk>/",
        DireccionDetailView.as_view(),
        name="direcciones-detail",
    ),
]
