from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CotizacionViewSet, DetalleCotizacionViewSet

router = DefaultRouter()
router.register(r"cotizaciones", CotizacionViewSet, basename="cotizacion")
router.register(r"detalle-cotizacion", DetalleCotizacionViewSet, basename="detalle-cotizacion")

urlpatterns = [
    path("", include(router.urls)),
]