from django.urls import path
from . import views

urlpatterns = [
    path('predicciones/stock/', views.predecir_stock, name='predecir_stock'),
]