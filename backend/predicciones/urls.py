from django.urls import path
from .views import Prediccion, ListarPrediccionesStock


app_name = "predicciones"

urlpatterns = [
    path(
        "predicciones/llegada/",
        Prediccion.as_view(permisos_por_metodo={"POST": ("ia", "Predicción de tiempo de llegada")}),
        {"tipo": "llegada"},
        name="llegada",
    ),
    path(
        "predicciones/precio/",
        Prediccion.as_view(permisos_por_metodo={"POST": ("ia", "Predicción de precio")}),
        {"tipo": "precio"},
        name="precio",
    ),
    path("predicciones/stock/", ListarPrediccionesStock.as_view(), name="listar_predicciones_stock",),
]

