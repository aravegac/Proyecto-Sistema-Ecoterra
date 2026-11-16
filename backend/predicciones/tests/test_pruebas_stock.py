from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import importlib
import json

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from rest_framework.test import APIRequestFactory

from predicciones.services import stock_service
from predicciones import modelos
from predicciones.views import Prediccion

from rest_framework.request import Request
from rest_framework import status


stock_ml = importlib.import_module(
    "predicciones.ml.predecir_stock"
)

# ==========================================================
# DATOS AUXILIARES
# ==========================================================

def crear_valores_stock(**cambios):
    """
    Construye una entrada válida para el predictor de stock.
    Permite reemplazar variables mediante argumentos.
    """
    valores = {
        "stock_actual": 120,
        "stock_minimo": 30,
        "ventas_promedio_90d": 5,
        "cobertura_stock_dias": 24,
        "desviacion_ventas_90d": 2,
        "tendencia_ventas_90d_pct": 0.15,
        "ventas_maximas_90d": 12,
        "dias_con_ventas_90d": 60,
        "ventas_promedio_30d": 6,
        "ventas_promedio_60d": 5,
        "variacion_30d_90d": 0.2,
        "dias_desde_ultima_venta": 1,
        "tendencia_ventas_30d_pct": 0.1,
        "dias_historial_disponible": 90,
    }

    valores.update(cambios)
    return valores


def crear_rangos_validos():
    """
    Genera metadatos válidos para todas las variables
    utilizadas en la evaluación de rangos.
    """
    return {
        variable: {
            "minimo": 0,
            "maximo": 1000,
            "percentil_01": 10,
            "percentil_99": 900,
        }
        for variable in stock_ml.VARIABLES_CLAVE_OOD
    }


def crear_producto(
    id=1,
    codigo="PROD-001",
    nombre="Producto de prueba",
    stock_minimo=10,
):
    return SimpleNamespace(
        id=id,
        codigo=codigo,
        nombre=nombre,
        stock_minimo=stock_minimo,
    )


# ==========================================================
# PU-08: CÁLCULO DE VARIABLES DE DEMANDA
# ==========================================================

class PruebasPU08CalcularVariablesDemanda(SimpleTestCase):

    def test_pu_08_01_calcula_promedios_de_ventas(self):
        ventas = [10.0] * 90

        resultado = stock_service.calcular_variables_demanda(
            ventas
        )

        self.assertEqual(resultado["ventas_promedio_90d"], 10)
        self.assertEqual(resultado["ventas_promedio_60d"], 10)
        self.assertEqual(resultado["ventas_promedio_30d"], 10)

    def test_pu_08_02_calcula_desviacion_estandar(self):
        ventas = [10.0] * 90

        resultado = stock_service.calcular_variables_demanda(
            ventas
        )

        self.assertEqual(resultado["desviacion_ventas_90d"], 0)

    def test_pu_08_03_conserva_tendencias_negativas(self):
        # Primeros 60 días: ventas altas.
        # Últimos 30 días: ventas bajas.
        ventas = [10.0] * 60 + [1.0] * 30

        resultado = stock_service.calcular_variables_demanda(
            ventas
        )

        self.assertLess(
            resultado["tendencia_ventas_90d_pct"],
            0,
        )

        self.assertLess(
            resultado["variacion_30d_90d"],
            0,
        )

    def test_pu_08_04_calcula_maximo_y_dias_con_ventas(self):
        ventas = [0.0] * 90
        ventas[10] = 5
        ventas[30] = 12
        ventas[89] = 3

        resultado = stock_service.calcular_variables_demanda(
            ventas
        )

        self.assertEqual(resultado["ventas_maximas_90d"], 12)
        self.assertEqual(resultado["dias_con_ventas_90d"], 3)

    def test_pu_08_05_calcula_dias_desde_ultima_venta(self):
        ventas = [0.0] * 90
        ventas[85] = 4

        resultado = stock_service.calcular_variables_demanda(
            ventas
        )

        self.assertEqual(
            resultado["dias_desde_ultima_venta"],
            4,
        )

    def test_pu_08_06_sin_ventas_retorna_valores_cero(self):
        ventas = [0.0] * 90

        resultado = stock_service.calcular_variables_demanda(
            ventas
        )

        self.assertEqual(resultado["ventas_promedio_90d"], 0)
        self.assertEqual(resultado["ventas_maximas_90d"], 0)
        self.assertEqual(resultado["dias_con_ventas_90d"], 0)
        self.assertEqual(
            resultado["dias_desde_ultima_venta"],
            90,
        )

    def test_pu_08_07_rechaza_historial_distinto_de_90_dias(self):
        with self.assertRaises(ValueError):
            stock_service.calcular_variables_demanda(
                [1.0] * 89
            )



class PruebasPU09DisponibilidadModelos(SimpleTestCase):

    """
    PU-09 — Validar el comportamiento cuando no existen
    modelos entrenados o disponibles.

    Se comprueba la carga de los artefactos y el tratamiento
    independiente de errores para los servicios de llegada
    y precio.
    """

    def setUp(self):
        self.factory = APIRequestFactory()

        # Se utiliza una fecha futura para superar las
        # validaciones de fecha de los servicios.
        self.fecha_futura = (
            timezone.localdate() + timedelta(days=45)
        )

    
    def ejecutar_prediccion(self, tipo, datos):
        solicitud = self.factory.post(
            "/api/predicciones/",
            datos,
            format="json"
        )

        request = Prediccion().initialize_request(solicitud)

        return Prediccion().post(request, tipo)


    def datos_llegada(self):
        return {
            "puerto": "Miami, FL",
            "naviera": "MSC",
            "carga": "Exclusiva",
            "mes": self.fecha_futura.month,
            "anio": self.fecha_futura.year,
        }

    def datos_precio(self):
        return {
            "producto": 1,
            "fecha": self.fecha_futura.isoformat(),
            "cantidad": 10,
            "moneda": "CLP",
        }

    # --------------------------------------------------
    # PRUEBAS DE CARGA DE LOS ARTEFACTOS
    # --------------------------------------------------

    def test_pu_09_01_modelo_inexistente_genera_error(self):

        """
        Comprueba que cargar() propaga el error cuando
        no existe el archivo modelos.json.
        """

        with TemporaryDirectory() as directorio:

            with override_settings(
                BASE_DIR=Path(directorio)
            ):

                modelos.cargar.cache_clear()

                try:
                    with self.assertRaises(FileNotFoundError):
                        modelos.cargar()

                finally:
                    modelos.cargar.cache_clear()

    def test_pu_09_02_modelo_corrupto_genera_error(self):

        """
        Comprueba que cargar() propaga el error cuando
        el archivo modelos.json contiene JSON inválido.
        """

        with TemporaryDirectory() as directorio:

            ruta = (
                Path(directorio)
                / "predicciones"
                / "artefactos"
            )

            ruta.mkdir(parents=True)

            archivo = ruta / "modelos.json"

            archivo.write_text(
                "{ contenido JSON inválido ",
                encoding="utf-8"
            )

            with override_settings(
                BASE_DIR=Path(directorio)
            ):

                modelos.cargar.cache_clear()

                try:
                    with self.assertRaises(json.JSONDecodeError):
                        modelos.cargar()

                finally:
                    modelos.cargar.cache_clear()

    # --------------------------------------------------
    # PRUEBAS INDEPENDIENTES DEL SERVICIO DE LLEGADA
    # --------------------------------------------------

    @patch(
        "predicciones.views.cargar",
        side_effect=FileNotFoundError(
            "No existe el archivo de modelos."
        )
    )
    def test_pu_09_03_llegada_modelo_inexistente_no_genera_estimacion(
        self,
        mock_cargar
    ):

        """
        Comprueba que el servicio de llegada responde
        con HTTP 503 cuando no existe el modelo.
        """

        response = self.ejecutar_prediccion(
            "llegada",
            self.datos_llegada()
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE
        )

        self.assertIn(
            "Modelos no disponibles",
            response.data["detail"]
        )

        self.assertNotIn(
            "estimacion",
            response.data
        )

        mock_cargar.assert_called_once()

    @patch(
        "predicciones.views.cargar",
        side_effect=json.JSONDecodeError(
            "JSON inválido",
            "{",
            0
        )
    )
    def test_pu_09_04_llegada_modelo_corrupto_no_genera_estimacion(
        self,
        mock_cargar
    ):

        """
        Comprueba que el servicio de llegada responde
        con HTTP 503 cuando los artefactos están corruptos.
        """

        response = self.ejecutar_prediccion(
            "llegada",
            self.datos_llegada()
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE
        )

        self.assertIn(
            "Modelos no disponibles",
            response.data["detail"]
        )

        self.assertNotIn(
            "estimacion",
            response.data
        )

        mock_cargar.assert_called_once()

    # --------------------------------------------------
    # PRUEBAS INDEPENDIENTES DEL SERVICIO DE PRECIO
    # --------------------------------------------------

    @patch("predicciones.views.Producto")
    @patch(
        "predicciones.views.cargar",
        side_effect=FileNotFoundError(
            "No existe el archivo de modelos."
        )
    )
    def test_pu_09_05_precio_modelo_inexistente_no_genera_estimacion(
        self,
        mock_cargar,
        mock_producto
    ):

        """
        Comprueba que el servicio de precio responde
        con HTTP 503 cuando no existe el modelo.
        """

        mock_producto.objects.filter.return_value.first.return_value = (
            SimpleNamespace(codigo="P001")
        )

        response = self.ejecutar_prediccion(
            "precio",
            self.datos_precio()
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE
        )

        self.assertIn(
            "Modelos no disponibles",
            response.data["detail"]
        )

        self.assertNotIn(
            "estimacion",
            response.data
        )

        mock_cargar.assert_called_once()

    @patch("predicciones.views.Producto")
    @patch(
        "predicciones.views.cargar",
        side_effect=json.JSONDecodeError(
            "JSON inválido",
            "{",
            0
        )
    )
    def test_pu_09_06_precio_modelo_corrupto_no_genera_estimacion(
        self,
        mock_cargar,
        mock_producto
    ):

        """
        Comprueba que el servicio de precio responde
        con HTTP 503 cuando los artefactos están corruptos.
        """

        mock_producto.objects.filter.return_value.first.return_value = (
            SimpleNamespace(codigo="P001")
        )

        response = self.ejecutar_prediccion(
            "precio",
            self.datos_precio()
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE
        )

        self.assertIn(
            "Modelos no disponibles",
            response.data["detail"]
        )

        self.assertNotIn(
            "estimacion",
            response.data
        )

        mock_cargar.assert_called_once()


# ==========================================================
# PU-10: OBTENER VENTAS DIARIAS
# ==========================================================

class PruebasPU10ObtenerVentasDiarias(SimpleTestCase):

    @patch("predicciones.services.stock_service.DetalleFactura.objects")
    def test_pu_10_01_filtra_estados_y_agrupa_por_fecha(
        self,
        mock_objects,
    ):
        fecha_inicio = date(2026, 10, 1)
        fecha_actual = date(2026, 10, 3)

        registros = [
            {
                "id_factura__fecha_emision": date(2026, 10, 1),
                "ventas_dia": 5,
            },
            {
                "id_factura__fecha_emision": date(2026, 10, 3),
                "ventas_dia": 8,
            },
        ]

        (
            mock_objects
            .filter.return_value
            .values.return_value
            .annotate.return_value
        ) = registros

        resultado = stock_service.obtener_ventas_diarias_90d(
            producto=1,
            fecha_inicio=fecha_inicio,
            fecha_actual=fecha_actual,
        )

        mock_objects.filter.assert_called_once_with(
            id_producto=1,
            id_factura__estado__in=["PAGADA", "EMITIDA"],
            id_factura__fecha_emision__range=(
                fecha_inicio,
                fecha_actual,
            ),
        )

        self.assertEqual(resultado, [5.0, 0.0, 8.0])

    @patch("predicciones.services.stock_service.DetalleFactura.objects")
    def test_pu_10_02_completa_dias_sin_ventas_con_cero(
        self,
        mock_objects,
    ):
        fecha_inicio = date(2026, 10, 1)
        fecha_actual = date(2026, 10, 5)

        registros = [
            {
                "id_factura__fecha_emision": date(2026, 10, 2),
                "ventas_dia": 4,
            },
        ]

        (
            mock_objects
            .filter.return_value
            .values.return_value
            .annotate.return_value
        ) = registros

        resultado = stock_service.obtener_ventas_diarias_90d(
            producto=1,
            fecha_inicio=fecha_inicio,
            fecha_actual=fecha_actual,
        )

        self.assertEqual(
            resultado,
            [0.0, 4.0, 0.0, 0.0, 0.0],
        )

    @patch("predicciones.services.stock_service.DetalleFactura.objects")
    def test_pu_10_03_retorna_serie_en_cero_sin_registros(
        self,
        mock_objects,
    ):
        (
            mock_objects
            .filter.return_value
            .values.return_value
            .annotate.return_value
        ) = []

        resultado = stock_service.obtener_ventas_diarias_90d(
            producto=1,
            fecha_inicio=date(2026, 10, 1),
            fecha_actual=date(2026, 10, 3),
        )

        self.assertEqual(resultado, [0.0, 0.0, 0.0])


# ==========================================================
# PU-11: HISTORIAL DISPONIBLE
# ==========================================================

class PruebasPU11HistorialDisponible(SimpleTestCase):

    @patch(
        "predicciones.services.stock_service.FECHA_INICIO_HISTORIAL",
        date(2026, 8, 1),
    )
    def test_pu_11_01_reconoce_90_dias_disponibles(self):
        resultado = stock_service.obtener_dias_historial_disponible(
            date(2026, 10, 29)
        )

        self.assertEqual(resultado, 90)

    @patch(
        "predicciones.services.stock_service.FECHA_INICIO_HISTORIAL",
        date(2026, 8, 1),
    )
    def test_pu_11_02_reconoce_historial_inferior_a_90_dias(self):
        resultado = stock_service.obtener_dias_historial_disponible(
            date(2026, 10, 28)
        )

        self.assertEqual(resultado, 89)

    @patch(
        "predicciones.services.stock_service.FECHA_INICIO_HISTORIAL",
        date(2026, 8, 1),
    )
    def test_pu_11_03_limita_historial_a_90_dias(self):
        resultado = stock_service.obtener_dias_historial_disponible(
            date(2027, 1, 1)
        )

        self.assertEqual(resultado, 90)

    @patch(
        "predicciones.services.stock_service.FECHA_INICIO_HISTORIAL",
        date(2026, 8, 1),
    )
    def test_pu_11_04_no_retorna_historial_negativo(self):
        resultado = stock_service.obtener_dias_historial_disponible(
            date(2026, 7, 20)
        )

        self.assertEqual(resultado, 0)


# ==========================================================
# PU-12 Y PU-13: VALIDACIONES DEL SERVICIO
# ==========================================================

class PruebasPU12PU13ServicioStock(SimpleTestCase):

    def preparar_productos(self, productos):
        """
        Simula la consulta de productos activos.
        """
        queryset = MagicMock()
        queryset.order_by.return_value.only.return_value = productos
        return queryset

    @patch("predicciones.services.stock_service.predecir_stock_lote")
    @patch("predicciones.services.stock_service.obtener_ventas_diarias_por_producto")
    @patch("predicciones.services.stock_service.obtener_stock_actual_por_producto")
    @patch("predicciones.services.stock_service.Producto.objects")
    @patch("predicciones.services.stock_service.timezone.localdate")
    def test_pu_12_01_producto_sin_stock_minimo_no_se_predice(
        self,
        mock_fecha,
        mock_productos,
        mock_stock,
        mock_ventas,
        mock_predictor,
    ):
        producto = crear_producto(stock_minimo=None)

        mock_fecha.return_value = date(2026, 10, 29)

        mock_productos.filter.return_value = self.preparar_productos(
            [producto]
        )

        mock_stock.return_value = {
            producto.id: 50
        }

        # Evitar consultas reales de ventas.
        mock_ventas.return_value = {}

        resultado = stock_service.obtener_predicciones_stock()

        self.assertEqual(len(resultado), 1)

        self.assertIsNone(
            resultado[0]["stock_minimo"]
        )

        self.assertFalse(
            resultado[0]["prediccion_disponible"]
        )

        self.assertIn(
            "no tiene un stock mínimo",
            resultado[0]["mensaje"],
        )

        mock_predictor.assert_called_once_with([])

        # La consulta de ventas sí se realiza previamente.
        mock_ventas.assert_called_once()


    @patch("predicciones.services.stock_service.predecir_stock_lote")
    @patch("predicciones.services.stock_service.obtener_ventas_diarias_por_producto")
    @patch("predicciones.services.stock_service.obtener_stock_actual_por_producto")
    @patch("predicciones.services.stock_service.Producto.objects")
    @patch("predicciones.services.stock_service.timezone.localdate")
    def test_pu_13_01_producto_agotado_se_envia_al_predictor(
        self,
        mock_fecha,
        mock_productos,
        mock_stock,
        mock_ventas,
        mock_predictor,
    ):
        producto = crear_producto(stock_minimo=10)

        mock_fecha.return_value = date(2026, 10, 29)

        mock_productos.filter.return_value = self.preparar_productos(
            [producto]
        )

        mock_stock.return_value = {
            producto.id: 0
        }

        # Simular la consulta general de ventas.
        mock_ventas.return_value = {}

        # Simular la respuesta inmediata del predictor.
        mock_predictor.return_value = [{
            "prediccion_disponible": True,
            "dias_hasta_agotar_stock": 0,
            "estado_reposicion": "REPOSICION_INMEDIATA",
            "mensaje": "El producto no tiene stock disponible.",
        }]

        resultado = stock_service.obtener_predicciones_stock()

        self.assertEqual(len(resultado), 1)

        self.assertTrue(
            resultado[0]["prediccion_disponible"]
        )

        self.assertTrue(
            resultado[0]["requiere_reposicion"]
        )

        self.assertEqual(
            resultado[0]["estado_reposicion"],
            "REPOSICION_INMEDIATA",
        )

        self.assertEqual(
            resultado[0]["dias_hasta_agotar_stock"],
            0,
        )

        # La consulta general de ventas se realiza una vez.
        mock_ventas.assert_called_once()

        # El predictor por lotes se ejecuta una vez.
        mock_predictor.assert_called_once()

        # Se comprueba que el producto llega con stock cero.
        entrada_predictor = mock_predictor.call_args[0][0][0]

        self.assertEqual(
            entrada_predictor["stock_actual"],
            0,
        )

        # El producto se identifica como agotado.
        self.assertEqual(
            entrada_predictor["ventas_promedio_90d"],
            0,
        )


# ==========================================================
# PU-14 Y PU-15: VALIDACIÓN DE ENTRADAS DEL PREDICTOR
# ==========================================================

class PruebasPU14PU15ValidacionPredictor(SimpleTestCase):

    def test_pu_14_01_promedio_90d_cero_no_permite_predecir(self):
        valores = crear_valores_stock(
            ventas_promedio_90d=0,
        )

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertFalse(resultado["prediccion_disponible"])
        self.assertIn("No se registraron ventas", resultado["mensaje"])

    def test_pu_14_02_promedio_90d_positivo_permite_validacion(self):
        valores = crear_valores_stock()

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNotNone(normalizados)
        self.assertIsNone(resultado)

    def test_pu_15_01_rechaza_valor_nulo(self):
        valores = crear_valores_stock(stock_actual=None)

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertFalse(resultado["prediccion_disponible"])

    def test_pu_15_02_rechaza_valor_no_numerico(self):
        valores = crear_valores_stock(stock_actual="texto")

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertIn("no es numérico", resultado["mensaje"])

    def test_pu_15_03_rechaza_valor_infinito(self):
        valores = crear_valores_stock(stock_actual=float("inf"))

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertFalse(resultado["prediccion_disponible"])

    def test_pu_15_04_rechaza_valor_nan(self):
        valores = crear_valores_stock(stock_actual=float("nan"))

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertFalse(resultado["prediccion_disponible"])

    def test_pu_15_05_rechaza_variables_no_negativas(self):
        for variable in stock_ml.VARIABLES_NO_NEGATIVAS:
            with self.subTest(variable=variable):
                valores = crear_valores_stock(**{variable: -1})

                normalizados, resultado = stock_ml._validar_valores(
                    valores
                )

                self.assertIsNone(normalizados)
                self.assertIn(
                    "no puede tener valores negativos",
                    resultado["mensaje"],
                )

    def test_pu_15_06_permite_tendencias_y_variaciones_negativas(self):
        valores = crear_valores_stock(
            tendencia_ventas_90d_pct=-0.5,
            tendencia_ventas_30d_pct=-0.3,
            variacion_30d_90d=-0.4,
        )

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNotNone(normalizados)
        self.assertIsNone(resultado)
        self.assertEqual(
            normalizados["tendencia_ventas_90d_pct"],
            -0.5,
        )

    def test_pu_15_07_rechaza_mas_de_90_dias_con_ventas(self):
        valores = crear_valores_stock(
            dias_con_ventas_90d=91,
        )

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertIn("no pueden superar", resultado["mensaje"])

    def test_pu_15_08_rechaza_mas_de_90_dias_sin_venta(self):
        valores = crear_valores_stock(
            dias_desde_ultima_venta=91,
        )

        normalizados, resultado = stock_ml._validar_valores(
            valores
        )

        self.assertIsNone(normalizados)
        self.assertIn("no pueden superar", resultado["mensaje"])


# ==========================================================
# PU-16: VALIDACIÓN Y EVALUACIÓN DE RANGOS
# ==========================================================

class PruebasPU16RangosEntrenamiento(SimpleTestCase):

    def setUp(self):
        stock_ml._rangos_validados = False

    def test_pu_16_01_acepta_metadatos_completos(self):
        rangos = crear_rangos_validos()

        resultado = stock_ml.validar_rangos(rangos)

        self.assertTrue(resultado)

    def test_pu_16_02_rechaza_variable_sin_rango(self):
        rangos = crear_rangos_validos()
        rangos.pop(stock_ml.VARIABLES_CLAVE_OOD[0])

        with self.assertRaises(ValueError):
            stock_ml.validar_rangos(rangos)

    def test_pu_16_03_rechaza_campo_requerido_ausente(self):
        rangos = crear_rangos_validos()
        variable = stock_ml.VARIABLES_CLAVE_OOD[0]
        rangos[variable].pop("minimo")

        with self.assertRaises(ValueError):
            stock_ml.validar_rangos(rangos)

    def test_pu_16_04_rechaza_limite_no_finito(self):
        rangos = crear_rangos_validos()
        variable = stock_ml.VARIABLES_CLAVE_OOD[0]
        rangos[variable]["maximo"] = float("inf")

        with self.assertRaises(ValueError):
            stock_ml.validar_rangos(rangos)

    def test_pu_16_05_rechaza_minimo_mayor_que_maximo(self):
        rangos = crear_rangos_validos()
        variable = stock_ml.VARIABLES_CLAVE_OOD[0]

        rangos[variable]["minimo"] = 100
        rangos[variable]["maximo"] = 50

        with self.assertRaises(ValueError):
            stock_ml.validar_rangos(rangos)

    @patch(
        "predicciones.ml.predecir_stock.cargar_rangos",
        return_value=None,
    )
    def test_pu_16_06_metadatos_ausentes_generan_advertencia(
        self,
        mock_cargar,
    ):
        stock_ml._rangos_validados = False

        valores = crear_valores_stock()

        resultado = stock_ml.evaluar_rangos_entrenamiento(
            valores
        )

        self.assertTrue(resultado["advertencia_modelo"])
        self.assertEqual(
            resultado["tipo_advertencia"],
            "METADATOS_NO_DISPONIBLES",
        )

    @patch(
        "predicciones.ml.predecir_stock.cargar_rangos",
        side_effect=json.JSONDecodeError(
            "JSON inválido",
            "",
            0,
        ),
    )
    def test_pu_16_07_json_corrupto_genera_advertencia(
        self,
        mock_cargar,
    ):
        stock_ml._rangos_validados = False

        resultado = stock_ml.evaluar_rangos_entrenamiento(
            crear_valores_stock()
        )

        self.assertEqual(
            resultado["tipo_advertencia"],
            "METADATOS_NO_DISPONIBLES",
        )

    @patch(
        "predicciones.ml.predecir_stock.cargar_rangos",
        return_value=crear_rangos_validos(),
    )
    def test_pu_16_08_detecta_valores_fuera_de_rango(
        self,
        mock_cargar,
    ):
        stock_ml._rangos_validados = False

        valores = crear_valores_stock(stock_actual=1500)

        resultado = stock_ml.evaluar_rangos_entrenamiento(
            valores
        )

        self.assertEqual(
            resultado["tipo_advertencia"],
            "FUERA_RANGO_ENTRENAMIENTO",
        )
        self.assertIn(
            "stock_actual",
            resultado["variables_fuera_rango"],
        )

    @patch(
        "predicciones.ml.predecir_stock.cargar_rangos",
        return_value=crear_rangos_validos(),
    )
    def test_pu_16_09_detecta_valores_atipicos(
        self,
        mock_cargar,
    ):
        stock_ml._rangos_validados = False

        valores = crear_valores_stock(stock_actual=5)

        resultado = stock_ml.evaluar_rangos_entrenamiento(
            valores
        )

        self.assertEqual(
            resultado["tipo_advertencia"],
            "VALORES_ATIPICOS",
        )
        self.assertIn(
            "stock_actual",
            resultado["variables_atipicas"],
        )


# ==========================================================
# PU-17: CONSTRUCCIÓN DEL RESULTADO
# ==========================================================

class PruebasPU17ConstruccionResultado(SimpleTestCase):

    @patch(
        "predicciones.ml.predecir_stock.evaluar_rangos_entrenamiento",
        return_value={
            "advertencia_modelo": False,
            "tipo_advertencia": None,
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": None,
        },
    )
    def test_pu_17_01_prediccion_negativa_se_ajusta_a_cero(
        self,
        mock_rangos,
    ):
        valores = crear_valores_stock()

        resultado = stock_ml._construir_resultado(
            valores,
            -5,
        )

        self.assertTrue(resultado["prediccion_disponible"])
        self.assertEqual(resultado["dias_hasta_agotar_stock"], 0)

    def test_pu_17_02_prediccion_no_finita_no_disponible(self):
        for valor in [float("nan"), float("inf"), float("-inf")]:
            with self.subTest(valor=valor):
                resultado = stock_ml._construir_resultado(
                    crear_valores_stock(),
                    valor,
                )

                self.assertFalse(
                    resultado["prediccion_disponible"]
                )

    @patch(
        "predicciones.ml.predecir_stock.evaluar_rangos_entrenamiento",
        return_value={
            "advertencia_modelo": False,
            "tipo_advertencia": None,
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": None,
        },
    )
    def test_pu_17_03_stock_igual_al_minimo_requiere_reposicion(
        self,
        mock_rangos,
    ):
        valores = crear_valores_stock(
            stock_actual=30,
            stock_minimo=30,
        )

        resultado = stock_ml._construir_resultado(
            valores,
            10,
        )

        self.assertEqual(
            resultado["estado_reposicion"],
            "REPOSICION_INMEDIATA",
        )

    @patch(
        "predicciones.ml.predecir_stock.evaluar_rangos_entrenamiento",
        return_value={
            "advertencia_modelo": False,
            "tipo_advertencia": None,
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": None,
        },
    )
    def test_pu_17_04_stock_sobre_minimo_no_requiere_reposicion_inmediata(
        self,
        mock_rangos,
    ):
        valores = crear_valores_stock(
            stock_actual=100,
            stock_minimo=30,
        )

        resultado = stock_ml._construir_resultado(
            valores,
            10,
        )

        self.assertEqual(
            resultado["estado_reposicion"],
            "STOCK_SOBRE_MINIMO",
        )


# ==========================================================
# PU-18: CARGA DEL MODELO Y METADATOS
# ==========================================================

class PruebasPU18CargaModeloYMetadatos(SimpleTestCase):

    def setUp(self):
        stock_ml._modelo_cache = None
        stock_ml._rangos_cache = None
        stock_ml._rangos_validados = False

    def test_pu_18_01_modelo_inexistente_lanza_error_de_archivo(self):
        with patch(
            "predicciones.ml.predecir_stock.RUTA_MODELO"
        ) as mock_ruta:
            mock_ruta.exists.return_value = False

            with self.assertRaises(FileNotFoundError):
                stock_ml.cargar_modelo()


    @patch(
        "predicciones.ml.predecir_stock.joblib.load",
        side_effect=RuntimeError("Error de lectura"),
    )
    @patch(
        "predicciones.ml.predecir_stock.RUTA_MODELO"
    )
    def test_pu_18_02_error_de_carga_del_modelo_se_propaga(
        self,
        mock_ruta,
        mock_load,
    ):
        mock_ruta.exists.return_value = True

        with self.assertRaises(RuntimeError):
            stock_ml.cargar_modelo()

    @patch(
        "predicciones.ml.predecir_stock.cargar_modelo",
        side_effect=FileNotFoundError("Modelo no encontrado"),
    )
    def test_pu_18_03_modelo_ausente_deja_prediccion_no_disponible(
        self,
        mock_cargar,
    ):
        valores = crear_valores_stock()

        resultado = stock_ml.predecir_stock_lote([valores])

        self.assertEqual(len(resultado), 1)
        self.assertFalse(resultado[0]["prediccion_disponible"])
        self.assertIn("Modelo no encontrado", resultado[0]["mensaje"])

    @patch(
        "predicciones.ml.predecir_stock.cargar_modelo",
        side_effect=RuntimeError("Fallo del predictor"),
    )
    def test_pu_18_04_error_del_modelo_deja_prediccion_no_disponible(
        self,
        mock_cargar,
    ):
        resultado = stock_ml.predecir_stock_lote([
            crear_valores_stock()
        ])

        self.assertFalse(resultado[0]["prediccion_disponible"])
        self.assertIn(
            "Fallo del predictor",
            resultado[0]["mensaje"],
        )

    @patch(
        "predicciones.ml.predecir_stock.cargar_rangos",
        side_effect=FileNotFoundError("Rangos no encontrados"),
    )
    def test_pu_18_05_rangos_ausentes_no_impiden_prediccion(
        self,
        mock_rangos,
    ):
        modelo = MagicMock()
        modelo.predict.return_value = [12.5]

        stock_ml._rangos_validados = False

        with patch(
            "predicciones.ml.predecir_stock.cargar_modelo",
            return_value=modelo,
        ):
            resultado = stock_ml.predecir_stock_lote([
                crear_valores_stock()
            ])

        self.assertTrue(resultado[0]["prediccion_disponible"])
        self.assertEqual(
            resultado[0]["tipo_advertencia"],
            "METADATOS_NO_DISPONIBLES",
        )


# ==========================================================
# PU-19: PREDICCIÓN POR LOTES
# ==========================================================

class PruebasPU19PrediccionPorLotes(SimpleTestCase):

    def setUp(self):
        stock_ml._rangos_validados = False

    @patch(
        "predicciones.ml.predecir_stock.evaluar_rangos_entrenamiento",
        return_value={
            "advertencia_modelo": False,
            "tipo_advertencia": None,
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": None,
        },
    )
    def test_pu_19_01_procesa_varios_productos_en_una_sola_llamada(
        self,
        mock_rangos,
    ):
        modelo = MagicMock()
        modelo.predict.return_value = [10.0, 20.0, 30.0]

        entradas = [
            crear_valores_stock(stock_actual=100),
            crear_valores_stock(stock_actual=200),
            crear_valores_stock(stock_actual=300),
        ]

        with patch(
            "predicciones.ml.predecir_stock.cargar_modelo",
            return_value=modelo,
        ):
            resultado = stock_ml.predecir_stock_lote(entradas)

        self.assertEqual(len(resultado), 3)
        modelo.predict.assert_called_once()

        self.assertEqual(
            [r["dias_hasta_agotar_stock"] for r in resultado],
            [10.0, 20.0, 30.0],
        )

    @patch(
        "predicciones.ml.predecir_stock.evaluar_rangos_entrenamiento",
        return_value={
            "advertencia_modelo": False,
            "tipo_advertencia": None,
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": None,
        },
    )
    def test_pu_19_02_conserva_orden_de_los_productos(
        self,
        mock_rangos,
    ):
        modelo = MagicMock()
        modelo.predict.return_value = [11.0, 22.0]

        entradas = [
            crear_valores_stock(stock_actual=100),
            crear_valores_stock(stock_actual=200),
        ]

        with patch(
            "predicciones.ml.predecir_stock.cargar_modelo",
            return_value=modelo,
        ):
            resultado = stock_ml.predecir_stock_lote(entradas)

        self.assertEqual(
            resultado[0]["dias_hasta_agotar_stock"],
            11.0,
        )
        self.assertEqual(
            resultado[1]["dias_hasta_agotar_stock"],
            22.0,
        )

    @patch(
        "predicciones.ml.predecir_stock.evaluar_rangos_entrenamiento",
        return_value={
            "advertencia_modelo": False,
            "tipo_advertencia": None,
            "variables_fuera_rango": [],
            "variables_atipicas": [],
            "mensaje_advertencia": None,
        },
    )
    def test_pu_19_03_producto_invalido_conserva_su_resultado(
        self,
        mock_rangos,
    ):
        modelo = MagicMock()
        modelo.predict.return_value = [15.0, 25.0]

        entradas = [
            crear_valores_stock(stock_actual=100),
            crear_valores_stock(stock_actual=-5),
            crear_valores_stock(stock_actual=200),
        ]

        modelo.predict.return_value = [15.0, 25.0]

        with patch(
            "predicciones.ml.predecir_stock.cargar_modelo",
            return_value=modelo,
        ):
            resultado = stock_ml.predecir_stock_lote(entradas)

        self.assertEqual(len(resultado), 3)

        self.assertTrue(resultado[0]["prediccion_disponible"])
        self.assertFalse(resultado[1]["prediccion_disponible"])
        self.assertTrue(resultado[2]["prediccion_disponible"])

        self.assertIn(
            "no puede tener valores negativos",
            resultado[1]["mensaje"],
        )

        # Solo los dos productos válidos llegan al modelo.
        modelo.predict.assert_called_once()
        self.assertEqual(
            len(modelo.predict.call_args[0][0]),
            2,
        )
