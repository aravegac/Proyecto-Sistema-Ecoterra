from django.urls import path
from . import views

urlpatterns = [
    # Path TEMPORAL, puede cambiar eventualmente
    path('predicciones/stock/', views.predecir_stock, name='predecir_stock'),
]