from django.urls import path

from .views import ProveedorDetailView, ProveedorListView


urlpatterns = [
    path("proveedores/", ProveedorListView.as_view(), name="proveedores-list"),
    path("proveedores/<int:pk>/", ProveedorDetailView.as_view(), name="proveedores-detail"),
]