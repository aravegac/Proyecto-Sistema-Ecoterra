from django.urls import path
from .views import Prediccion

app_name = "predicciones"

urlpatterns = [
    path("predicciones/llegada/", Prediccion.as_view(), {"tipo": "llegada"}, name="llegada"),
    path("predicciones/precio/", Prediccion.as_view(), {"tipo": "precio"}, name="precio"),
]
