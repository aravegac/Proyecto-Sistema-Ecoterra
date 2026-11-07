from decimal import Decimal, ROUND_HALF_UP
import json

from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from usuarios.permissions import PermisoModulo
from inventario.models import Producto
from .modelos import PUERTOS, NAVIERAS, CARGAS, cargar, variables_precio

from predicciones.services.stock_service import (
    obtener_predicciones_stock,
)

class LlegadaEntrada(serializers.Serializer):
    puerto = serializers.ChoiceField(choices=PUERTOS)
    naviera = serializers.ChoiceField(choices=NAVIERAS)
    carga = serializers.ChoiceField(choices=CARGAS)
    mes = serializers.IntegerField(min_value=1, max_value=12)
    anio = serializers.IntegerField(min_value=1, max_value=9999)

    def validate(self, attrs):
        hoy = timezone.localdate()
        if (attrs["anio"], attrs["mes"]) < (hoy.year, hoy.month):
            raise serializers.ValidationError({"mes": "Selecciona el mes actual o uno futuro."})
        return attrs

class PrecioEntrada(serializers.Serializer):
    producto = serializers.IntegerField(min_value=1)
    fecha = serializers.DateField()
    cantidad = serializers.IntegerField(min_value=1, max_value=100)
    moneda = serializers.ChoiceField(choices=["CLP", "USD"], default="CLP")
    tipo_cambio = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal("0.0001"), required=False)

    def validate(self, attrs):
        if attrs["moneda"] == "USD" and "tipo_cambio" not in attrs:
            raise serializers.ValidationError({"tipo_cambio": "Ingresa cuántos CLP equivale 1 USD."})
        return attrs

    def validate_fecha(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError("La fecha debe ser hoy o una fecha futura.")
        return value

class Prediccion(APIView):
    permission_classes = [PermisoModulo]
    permisos_por_metodo = {}

    def post(self, request, tipo):
        entrada = (LlegadaEntrada if tipo == "llegada" else PrecioEntrada)(data=request.data)
        entrada.is_valid(raise_exception=True)
        # El año valida el período planificado; el modelo actual utiliza la estacionalidad mensual.
        datos = {k: v for k, v in entrada.validated_data.items() if k != "anio"}
        if tipo == "precio":
            producto = Producto.objects.filter(pk=datos["producto"], estado=True).first()
            if not producto:
                return Response({"detail": "Selecciona un producto activo existente."}, status=400)
            if producto.codigo not in [f"POL-{i:03}" for i in range(1,6)]:
                return Response({"detail": "Producto sin historial de entrenamiento. Incorpora sus datos y reentrena."}, status=422)
            datos = variables_precio(producto.codigo, datos["fecha"], datos["cantidad"])
        try:
            modelo = cargar()[tipo]
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            return Response({"detail": "Modelos no disponibles. Ejecuta el entrenamiento indicado en la guía."}, status=503)
        valor = round(max(0, float(modelo["modelo"].predict([datos])[0])), 2)
        resultado = {"estimacion": valor, "origen": "simulado", "version": "demo-1",
                     "mae_validacion": modelo["mae"], "muestras_entrenamiento": modelo["entrenamiento"],
                     "muestras_prueba": modelo["prueba"],
                     "aviso": "Datos simulados. Estimación de apoyo; no garantiza resultados ni ejecuta compras."}
        if tipo == "precio":
            moneda = entrada.validated_data["moneda"]
            tasa = entrada.validated_data.get("tipo_cambio", Decimal("1")) if moneda == "USD" else Decimal("1")
            precision = Decimal("1") if moneda == "CLP" else Decimal("0.01")
            unitario = (Decimal(str(valor)) / tasa).quantize(precision, rounding=ROUND_HALF_UP)
            error = (Decimal(str(modelo["mae"])) / tasa).quantize(precision, rounding=ROUND_HALF_UP)
            resultado.update(estimacion=float(unitario), mae_validacion=float(error), moneda=moneda,
                             total=float(unitario * entrada.validated_data["cantidad"]))
            if moneda == "USD":
                resultado.update(tipo_cambio=float(tasa), origen_tipo_cambio="ingresado_por_usuario")
            fin = modelo.get("fecha_fin_entrenamiento")
            if fin and entrada.validated_data["fecha"].isoformat() > fin:
                resultado["aviso"] += " Fecha fuera del período entrenado; la precisión no está validada para ese horizonte."

        return Response(resultado)



class ListarPrediccionesStock(APIView):
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("ia", "Predicción de reposición de stock"),
    }

    def get(self, request):
        """
        Consulta las predicciones de reposición
        de los productos de Ecoterra.
        """
        try:
            resultados = obtener_predicciones_stock()

            return Response(
                {
                    "exito": True,
                    "total_productos": len(resultados),
                    "resultados": resultados,
                },
                status=status.HTTP_200_OK,
            )

        except Exception:
            return Response(
                {
                    "exito": False,
                    "mensaje": (
                        "Ocurrió un error al obtener las predicciones "
                        "de stock."
                    ),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


