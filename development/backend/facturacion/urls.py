
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"orden-compras", views.OrdenCompraViewSet, basename="orden-compra-facturacion")
router.register(r"facturas", views.FacturaViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
