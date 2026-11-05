from django.urls import path
from .views import Prediccion
from predicciones import views

app_name = "predicciones"

urlpatterns = [
    path("predicciones/llegada/", Prediccion.as_view(), {"tipo": "llegada"}, name="llegada"),
    path("predicciones/precio/", Prediccion.as_view(), {"tipo": "precio"}, name="precio"),
    path("predicciones/stock/", views.listar_predicciones_stock, name="listar_predicciones_stock",),
]

