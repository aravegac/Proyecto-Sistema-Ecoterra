
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from .models import Cotizacion, DetalleCotizacion
from .pdf import generar_pdf_cotizacion
from .serializers import CotizacionSerializer


class PruebasUnitariasCotizacionesSprint3(SimpleTestCase):
    """
    Pruebas unitarias aisladas del Sprint 3.

    No utilizan una base de datos real.
    Las operaciones del ORM se reemplazan mediante mocks.
    """

    def datos_cotizacion(self):
        """Datos de ejemplo para probar la lógica del serializador."""
        return {
            "id_cliente": SimpleNamespace(pk=7),
            "fecha_cotizacion": date(2026, 10, 27),
            "dias_vigencia_cotizacion": 30,
            "vigencia_cotizacion": date(2026, 11, 26),
            "condicion_pago_cotizacion": "30 días",
            "subtotal_cotizacion": Decimal("2000.00"),
            "iva_cotizacion": Decimal("380.00"),
            "total_cotizacion": Decimal("2380.00"),
            "observacion_cotizacion": "Cotización de prueba",
            "estado_cotizacion": "Borrador",
        }

    def detalle_prueba(self):
        """Detalle simulado de una cotización."""
        return {
            "id_producto": SimpleNamespace(pk=3),
            "descripcion_dc": "Producto de prueba",
            "cantidad_dc": Decimal("2.00"),
            "precio_unitario_dc": Decimal("1000.00"),
            "subtotal_dc": Decimal("2000.00"),
        }

    # PU-01
    @patch("cotizaciones.serializers.DetalleCotizacion.objects.create")
    @patch("cotizaciones.serializers.Cotizacion.objects.create")
    @patch("cotizaciones.serializers.Cotizacion.objects.order_by")
    def test_pu_01_genera_numero_automatico(
        self, mock_order_by, mock_create_cotizacion, mock_create_detalle
    ):
        """Genera el número siguiente y establece la ruta PDF predeterminada."""
        mock_order_by.return_value.first.return_value = SimpleNamespace(
            id_cotizacion=41
        )
        cotizacion_creada = SimpleNamespace(id_cotizacion=42)
        mock_create_cotizacion.return_value = cotizacion_creada

        datos = self.datos_cotizacion()
        serializer = CotizacionSerializer()

        resultado = serializer.create(datos.copy())

        self.assertIs(resultado, cotizacion_creada)
        mock_order_by.assert_called_once_with("-id_cotizacion")

        argumentos = mock_create_cotizacion.call_args.kwargs
        self.assertEqual(argumentos["numero_cotizacion"], "COT-0042")
        self.assertEqual(argumentos["ruta_pdf_cotizacion"], "")

        # No se necesita crear detalles para esta prueba.
        mock_create_detalle.assert_not_called()

    # PU-02
    @patch("cotizaciones.serializers.DetalleCotizacion.objects.create")
    @patch("cotizaciones.serializers.Cotizacion.objects.create")
    @patch("cotizaciones.serializers.Cotizacion.objects.order_by")
    def test_pu_02_crea_cabecera_y_detalles(
        self, mock_order_by, mock_create_cotizacion, mock_create_detalle
    ):
        """Comprueba las llamadas de creación de cabecera y líneas de detalle."""
        mock_order_by.return_value.first.return_value = None
        cotizacion_creada = SimpleNamespace(id_cotizacion=1)
        mock_create_cotizacion.return_value = cotizacion_creada

        datos = self.datos_cotizacion()
        datos["detalles"] = [
            self.detalle_prueba(),
            {
                **self.detalle_prueba(),
                "descripcion_dc": "Segundo producto",
            },
        ]

        serializer = CotizacionSerializer()
        resultado = serializer.create(datos.copy())

        self.assertIs(resultado, cotizacion_creada)
        mock_create_cotizacion.assert_called_once()

        argumentos_cabecera = mock_create_cotizacion.call_args.kwargs
        self.assertEqual(argumentos_cabecera["numero_cotizacion"], "COT-0001")
        self.assertEqual(argumentos_cabecera["total_cotizacion"], Decimal("2380.00"))

        self.assertEqual(mock_create_detalle.call_count, 2)

        for llamada in mock_create_detalle.call_args_list:
            self.assertIs(
                llamada.kwargs["id_cotizacion"], cotizacion_creada
            )

        self.assertEqual(
            mock_create_detalle.call_args_list[0].kwargs["descripcion_dc"],
            "Producto de prueba",
        )
        self.assertEqual(
            mock_create_detalle.call_args_list[1].kwargs["descripcion_dc"],
            "Segundo producto",
        )

    # PU-03
    @patch("cotizaciones.serializers.DetalleCotizacion.objects.create")
    @patch("cotizaciones.serializers.DetalleCotizacion.objects.filter")
    def test_pu_03_actualiza_cabecera_y_reemplaza_detalles(
        self, mock_filter_detalles, mock_create_detalle
    ):
        """Comprueba la actualización de campos y el reemplazo de detalles."""
        instancia = SimpleNamespace(
            id_cotizacion=12,
            observacion_cotizacion="Observación anterior",
            save=Mock(),
        )

        queryset_simulado = Mock()
        mock_filter_detalles.return_value = queryset_simulado

        nuevos_detalles = [
            self.detalle_prueba(),
            {
                **self.detalle_prueba(),
                "descripcion_dc": "Producto actualizado",
            },
        ]

        serializer = CotizacionSerializer()
        resultado = serializer.update(
            instancia,
            {
                "observacion_cotizacion": "Observación actualizada",
                "detalles": nuevos_detalles,
            },
        )

        self.assertIs(resultado, instancia)
        self.assertEqual(
            instancia.observacion_cotizacion, "Observación actualizada"
        )
        instancia.save.assert_called_once_with()

        mock_filter_detalles.assert_called_once_with(id_cotizacion=instancia)
        queryset_simulado.delete.assert_called_once_with()
        self.assertEqual(mock_create_detalle.call_count, 2)

        for llamada in mock_create_detalle.call_args_list:
            self.assertIs(llamada.kwargs["id_cotizacion"], instancia)

    # PU-04
    @patch.object(CotizacionSerializer, "get_cliente_direcciones", return_value=[])
    def test_pu_04_representa_cotizacion_y_detalles(self, mock_direcciones):
        """Comprueba la representación de salida sin consultar una base real."""
        cliente = SimpleNamespace(
            pk=7,
            razon_social="Cliente de prueba",
            rut="12345678-9",
            telefono="912345678",
            email="cliente@example.com",
            representante="Representante de prueba",
        )

        producto = SimpleNamespace(
            pk=3,
            codigo="PROD-003",
            nombre="Producto de prueba",
            unidad="Litros",
        )

        detalle = SimpleNamespace(
            id_producto=producto,
            descripcion_dc="Producto agrícola",
            cantidad_dc=Decimal("2.00"),
            precio_unitario_dc=Decimal("1000.00"),
            subtotal_dc=Decimal("2000.00"),
        )

        detalles_relacionados = Mock()
        detalles_relacionados.all.return_value = [detalle]

        cotizacion = SimpleNamespace(
            id_cotizacion=42,
            id_cliente=cliente,
            numero_cotizacion="COT-0042",
            fecha_cotizacion=date(2026, 10, 27),
            dias_vigencia_cotizacion=30,
            vigencia_cotizacion=date(2026, 11, 26),
            condicion_pago_cotizacion="30 días",
            subtotal_cotizacion=Decimal("2000.00"),
            iva_cotizacion=Decimal("380.00"),
            total_cotizacion=Decimal("2380.00"),
            observacion_cotizacion="Observación",
            estado_cotizacion="Borrador",
            ruta_pdf_cotizacion="",
            detallecotizacion_set=detalles_relacionados,
        )

        serializer = CotizacionSerializer()
        resultado = serializer.to_representation(cotizacion)

        self.assertEqual(resultado["id_cotizacion"], 42)
        self.assertEqual(resultado["numero_cotizacion"], "COT-0042")
        self.assertEqual(resultado["id_cliente"], 7)
        self.assertEqual(resultado["cliente_nombre"], "Cliente de prueba")
        self.assertEqual(resultado["cliente_rut"], "12345678-9")
        self.assertEqual(resultado["cliente_direcciones"], [])

        self.assertIn("detalles", resultado)
        self.assertEqual(len(resultado["detalles"]), 1)
        self.assertEqual(resultado["detalles"][0]["id_producto"], 3)
        self.assertEqual(
            resultado["detalles"][0]["nombre_producto"], "Producto de prueba"
        )
        self.assertEqual(
            resultado["detalles"][0]["descripcion_dc"], "Producto agrícola"
        )
        mock_direcciones.assert_called_once_with(cotizacion)

    # PU-05
    def test_pu_05_genera_pdf_valido_con_caracteres_especiales(self):
        """Comprueba la generación en memoria de un PDF de cotización."""
        detalle = SimpleNamespace(
            descripcion_dc="Polímero <especial> & agrícola",
            cantidad_dc=2,
            precio_unitario_dc=Decimal("1000.00"),
            subtotal_dc=Decimal("2000.00"),
        )

        detalles_relacionados = Mock()
        detalles_relacionados.all.return_value.order_by.return_value = [detalle]

        cliente = SimpleNamespace(
            razon_social="Cliente & Compañía",
            rut="12345678-9",
        )

        cotizacion = SimpleNamespace(
            numero_cotizacion="COT-0042",
            fecha_cotizacion=date(2026, 10, 27),
            vigencia_cotizacion=date(2026, 11, 26),
            id_cliente=cliente,
            condicion_pago_cotizacion="30 días",
            estado_cotizacion="Borrador",
            detallecotizacion_set=detalles_relacionados,
            subtotal_cotizacion=Decimal("2000.00"),
            iva_cotizacion=Decimal("380.00"),
            total_cotizacion=Decimal("2380.00"),
            observacion_cotizacion="Observación <prueba>",
        )

        with patch("cotizaciones.pdf.formato_moneda", side_effect=str):
            contenido = generar_pdf_cotizacion(cotizacion)

        self.assertIsInstance(contenido, bytes)
        self.assertTrue(contenido.startswith(b"%PDF-"))
        self.assertIn(b"%%EOF", contenido)
        detalles_relacionados.all.assert_called_once_with()
        detalles_relacionados.all.return_value.order_by.assert_called_once_with(
            "id_dc"
        )
