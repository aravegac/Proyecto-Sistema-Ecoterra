# backend/ventas/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrdenCompraViewSet, NotaCreditoViewSet

router = DefaultRouter()
router.register(r"ordenes-compra", OrdenCompraViewSet, basename="orden-compra")
router.register(r"notas-credito", NotaCreditoViewSet, basename="nota-credito")

urlpatterns = [
    path("", include(router.urls)),
]