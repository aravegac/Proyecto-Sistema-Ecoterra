from datetime import date, timedelta
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
from .modelos import PUERTOS, NAVIERAS, CARGAS, MIN_VENTAS_PRECIO, cargar, variables_precio

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
            raise serializers.ValidationError(
                {"mes": "Selecciona el mes actual o uno futuro."}
            )
        return attrs


class PrecioEntrada(serializers.Serializer):
    producto = serializers.IntegerField(min_value=1)
    fecha = serializers.DateField()
    cantidad = serializers.IntegerField(min_value=1, max_value=10000)
    moneda = serializers.ChoiceField(choices=["CLP", "USD"], default="CLP")
    tipo_cambio = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=Decimal("0.0001"),
        required=False
    )

    def validate(self, attrs):
        if attrs["moneda"] == "USD" and "tipo_cambio" not in attrs:
            raise serializers.ValidationError(
                {"tipo_cambio": "Ingresa cuántos CLP equivale 1 USD."}
            )
        return attrs

    def validate_fecha(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError(
                "La fecha debe ser hoy o una fecha futura."
            )
        return value


def calcular_importes_precio(valor, mae, moneda, cantidad, tipo_cambio=None):
    """
    Calcula el precio estimado, el MAE convertido y el total
    según la moneda y la cantidad solicitada.
    """

    tasa = tipo_cambio if moneda == "USD" else Decimal("1")

    precision = Decimal("1") if moneda == "CLP" else Decimal("0.01")

    unitario = (
        Decimal(str(valor)) / tasa
    ).quantize(precision, rounding=ROUND_HALF_UP)

    error = (
        Decimal(str(mae)) / tasa
    ).quantize(precision, rounding=ROUND_HALF_UP)

    total = unitario * cantidad

    return {
        "estimacion": float(unitario),
        "mae_validacion": float(error),
        "moneda": moneda,
        "total": float(total),
    }


class Prediccion(APIView):
    permission_classes = [PermisoModulo]
    permisos_por_metodo = {}

    def post(self, request, tipo):
        entrada = (
            LlegadaEntrada if tipo == "llegada" else PrecioEntrada
        )(data=request.data)

        entrada.is_valid(raise_exception=True)

        # El año valida el período planificado; el modelo actual utiliza la estacionalidad mensual.
        datos = {
            k: v for k, v in entrada.validated_data.items()
            if k != "anio"
        }

        if tipo == "precio":
            producto = Producto.objects.filter(
                pk=datos["producto"],
                estado=True
            ).first()

            if not producto:
                return Response(
                    {"detail": "Selecciona un producto activo existente."},
                    status=400
                )

            datos = variables_precio(
                producto.codigo,
                datos["fecha"],
                datos["cantidad"]
            )

        try:
            modelo = cargar()[tipo]

        except (
            OSError,
            ValueError,
            KeyError,
            TypeError,
            json.JSONDecodeError
        ):
            return Response(
                {
                    "detail": (
                        "Modelos no disponibles. Ejecuta el entrenamiento "
                        "indicado en la guía."
                    )
                },
                status=503
            )

        if tipo == "precio":
            # Solo se predice para productos que el modelo vio al entrenar.
            ventas_producto = modelo.get("productos", {}).get(producto.codigo)

            if not ventas_producto:
                return Response(
                    {
                        "detail": (
                            f"{producto.codigo} no tiene suficiente historial "
                            f"de precios. Se necesitan al menos "
                            f"{MIN_VENTAS_PRECIO} ventas facturadas y volver "
                            "a entrenar el modelo."
                        )
                    },
                    status=422
                )

        valor = round(
            max(0, float(modelo["modelo"].predict([datos])[0])),
            2
        )

        if tipo == "precio" and modelo.get("origen") == "facturas":
            aviso = (
                f"Basado en {ventas_producto} facturas reales de "
                f"{producto.codigo} "
                f"({modelo['entrenamiento'] + modelo['prueba']} en total). "
                "Estimación de apoyo; no garantiza resultados."
            )
            origen = "facturas"

        else:
            aviso = (
                "Datos simulados. Estimación de apoyo; no garantiza "
                "resultados ni ejecuta compras."
            )
            origen = "simulado"

        resultado = {
            "estimacion": valor,
            "origen": origen,
            "version": (
                "facturas-1" if origen == "facturas" else "demo-1"
            ),
            "mae_validacion": modelo["mae"],
            "muestras_entrenamiento": modelo["entrenamiento"],
            "muestras_prueba": modelo["prueba"],
            "aviso": aviso
        }

        if tipo == "precio":
            moneda = entrada.validated_data["moneda"]

            tasa = (
                entrada.validated_data.get(
                    "tipo_cambio",
                    Decimal("1")
                )
                if moneda == "USD"
                else Decimal("1")
            )

            resultado.update(
                calcular_importes_precio(
                    valor=valor,
                    mae=modelo["mae"],
                    moneda=moneda,
                    cantidad=entrada.validated_data["cantidad"],
                    tipo_cambio=tasa,
                )
            )

            if moneda == "USD":
                resultado.update(
                    tipo_cambio=float(tasa),
                    origen_tipo_cambio="ingresado_por_usuario"
                )

            fin = modelo.get("fecha_fin_entrenamiento")

            # Con datos reales la última factura siempre es reciente: se avisa
            # solo cuando la fecha pedida está a más de 90 días de ella.
            if (
                fin
                and entrada.validated_data["fecha"]
                > date.fromisoformat(fin) + timedelta(days=90)
            ):
                resultado["aviso"] += (
                    " Fecha fuera del período entrenado; "
                    "la precisión no está validada para ese horizonte."
                )

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
