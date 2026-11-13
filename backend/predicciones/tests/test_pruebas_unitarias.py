from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from predicciones.views import (
    LlegadaEntrada,
    PrecioEntrada,
    calcular_importes_precio,
)


# ============================================================
# PU-01 — Validar variables requeridas para la predicción
#        de llegada
# ============================================================

class PU01ValidarVariablesLlegada(SimpleTestCase):

    def test_acepta_datos_validos(self):
        datos = {
            "puerto": "Miami, FL",
            "naviera": "MSC",
            "carga": "Exclusiva",
            "mes": 11,
            "anio": 2026,
        }

        with patch(
            "predicciones.views.timezone.localdate",
            return_value=date(2026, 11, 12),
        ):
            serializer = LlegadaEntrada(data=datos)

            self.assertTrue(
                serializer.is_valid(),
                serializer.errors,
            )

            self.assertEqual(
                serializer.validated_data["puerto"],
                "Miami, FL",
            )


# ============================================================
# PU-02 — Rechazar variables inválidas para la predicción
#        de llegada
# ============================================================

class PU02RechazarVariablesInvalidasLlegada(SimpleTestCase):

    def setUp(self):
        self.datos_validos = {
            "puerto": "Miami, FL",
            "naviera": "MSC",
            "carga": "Exclusiva",
            "mes": 11,
            "anio": 2026,
        }

    def test_rechaza_puerto_no_permitido(self):
        datos = self.datos_validos.copy()
        datos["puerto"] = "Puerto no permitido"

        serializer = LlegadaEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("puerto", serializer.errors)

    def test_rechaza_naviera_no_permitida(self):
        datos = self.datos_validos.copy()
        datos["naviera"] = "Naviera no permitida"

        serializer = LlegadaEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("naviera", serializer.errors)

    def test_rechaza_tipo_carga_no_permitido(self):
        datos = self.datos_validos.copy()
        datos["carga"] = "Carga no permitida"

        serializer = LlegadaEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("carga", serializer.errors)

    def test_rechaza_mes_menor_que_uno(self):
        datos = self.datos_validos.copy()
        datos["mes"] = 0

        serializer = LlegadaEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("mes", serializer.errors)

    def test_rechaza_mes_mayor_que_doce(self):
        datos = self.datos_validos.copy()
        datos["mes"] = 13

        serializer = LlegadaEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("mes", serializer.errors)


# ============================================================
# PU-03 — Validar que la predicción de llegada no acepte
#        períodos anteriores al actual
# ============================================================

class PU03ValidarPeriodoLlegada(SimpleTestCase):

    def setUp(self):
        self.datos_validos = {
            "puerto": "Miami, FL",
            "naviera": "MSC",
            "carga": "Exclusiva",
            "mes": 1,
            "anio": 2026,
        }

    def test_rechaza_mes_anterior_del_mismo_anio(self):
        datos = self.datos_validos.copy()
        datos["mes"] = 12
        datos["anio"] = 2025

        with patch(
            "predicciones.views.timezone.localdate",
            return_value=date(2026, 1, 15),
        ):
            serializer = LlegadaEntrada(data=datos)

            self.assertFalse(serializer.is_valid())
            self.assertIn("mes", serializer.errors)

    def test_acepta_periodo_actual(self):
        datos = self.datos_validos.copy()

        with patch(
            "predicciones.views.timezone.localdate",
            return_value=date(2026, 1, 15),
        ):
            serializer = LlegadaEntrada(data=datos)

            self.assertTrue(
                serializer.is_valid(),
                serializer.errors,
            )

    def test_acepta_mes_futuro_al_cambiar_de_anio(self):
        datos = self.datos_validos.copy()
        datos["mes"] = 2
        datos["anio"] = 2026

        with patch(
            "predicciones.views.timezone.localdate",
            return_value=date(2026, 1, 15),
        ):
            serializer = LlegadaEntrada(data=datos)

            self.assertTrue(
                serializer.is_valid(),
                serializer.errors,
            )


# ============================================================
# PU-04 — Validar variables requeridas para la predicción
#        de precio
# ============================================================

class PU04ValidarVariablesPrecio(SimpleTestCase):

    def test_acepta_datos_validos_en_clp(self):
        datos = {
            "producto": 1,
            "fecha": "2026-11-20",
            "cantidad": 10,
            "moneda": "CLP",
        }

        serializer = PrecioEntrada(data=datos)

        self.assertTrue(
            serializer.is_valid(),
            serializer.errors,
        )

    def test_acepta_datos_validos_en_usd(self):
        datos = {
            "producto": 1,
            "fecha": "2026-11-20",
            "cantidad": 10,
            "moneda": "USD",
            "tipo_cambio": "900.0000",
        }

        serializer = PrecioEntrada(data=datos)

        self.assertTrue(
            serializer.is_valid(),
            serializer.errors,
        )


# ============================================================
# PU-05 — Rechazar una predicción de precio con datos inválidos
# ============================================================

class PU05RechazarDatosInvalidosPrecio(SimpleTestCase):

    def setUp(self):
        self.datos_validos = {
            "producto": 1,
            "fecha": "2026-11-20",
            "cantidad": 10,
            "moneda": "CLP",
        }

    def test_rechaza_cantidad_menor_que_uno(self):
        datos = self.datos_validos.copy()
        datos["cantidad"] = 0

        serializer = PrecioEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("cantidad", serializer.errors)

    def test_rechaza_cantidad_superior_a_diez_mil(self):
        datos = self.datos_validos.copy()
        datos["cantidad"] = 10001

        serializer = PrecioEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("cantidad", serializer.errors)

    def test_rechaza_fecha_anterior_al_dia_actual(self):
        datos = self.datos_validos.copy()
        datos["fecha"] = "2026-11-10"

        with patch(
            "predicciones.views.timezone.localdate",
            return_value=date(2026, 11, 12),
        ):
            serializer = PrecioEntrada(data=datos)

            self.assertFalse(serializer.is_valid())
            self.assertIn("fecha", serializer.errors)

    def test_rechaza_moneda_no_permitida(self):
        datos = self.datos_validos.copy()
        datos["moneda"] = "EUR"

        serializer = PrecioEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("moneda", serializer.errors)


# ============================================================
# PU-06 — Validar el ingreso del tipo de cambio para USD
# ============================================================

class PU06ValidarTipoCambio(SimpleTestCase):

    def setUp(self):
        self.datos_validos = {
            "producto": 1,
            "fecha": "2026-11-20",
            "cantidad": 10,
            "moneda": "USD",
        }

    def test_acepta_tipo_cambio_positivo(self):
        datos = self.datos_validos.copy()
        datos["tipo_cambio"] = "900.0000"

        serializer = PrecioEntrada(data=datos)

        self.assertTrue(
            serializer.is_valid(),
            serializer.errors,
        )

    def test_rechaza_usd_sin_tipo_cambio(self):
        serializer = PrecioEntrada(data=self.datos_validos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("tipo_cambio", serializer.errors)

    def test_rechaza_tipo_cambio_igual_a_cero(self):
        datos = self.datos_validos.copy()
        datos["tipo_cambio"] = "0"

        serializer = PrecioEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("tipo_cambio", serializer.errors)

    def test_rechaza_tipo_cambio_negativo(self):
        datos = self.datos_validos.copy()
        datos["tipo_cambio"] = "-900"

        serializer = PrecioEntrada(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn("tipo_cambio", serializer.errors)


# ============================================================
# PU-07 — Validar el cálculo de la estimación monetaria
#        y el total
# ============================================================

class PU07CalcularEstimacionYTotal(SimpleTestCase):

    def test_calcula_importes_en_clp(self):
        resultado = calcular_importes_precio(
            valor=Decimal("1000"),
            mae=Decimal("100"),
            moneda="CLP",
            cantidad=3,
        )

        self.assertEqual(resultado["estimacion"], 1000.0)
        self.assertEqual(resultado["mae_validacion"], 100.0)
        self.assertEqual(resultado["moneda"], "CLP")
        self.assertEqual(resultado["total"], 3000.0)

    def test_calcula_importes_en_usd(self):
        resultado = calcular_importes_precio(
            valor=Decimal("9000"),
            mae=Decimal("900"),
            moneda="USD",
            cantidad=3,
            tipo_cambio=Decimal("900"),
        )

        self.assertEqual(resultado["estimacion"], 10.0)
        self.assertEqual(resultado["mae_validacion"], 1.0)
        self.assertEqual(resultado["moneda"], "USD")
        self.assertEqual(resultado["total"], 30.0)

    def test_aplica_dos_decimales_en_usd(self):
        resultado = calcular_importes_precio(
            valor=Decimal("1234.56"),
            mae=Decimal("12.34"),
            moneda="USD",
            cantidad=3,
            tipo_cambio=Decimal("900"),
        )

        self.assertEqual(resultado["estimacion"], 1.37)
        self.assertEqual(resultado["mae_validacion"], 0.01)
        self.assertEqual(resultado["total"], 4.11)
