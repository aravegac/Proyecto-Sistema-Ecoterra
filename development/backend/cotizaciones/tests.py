from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock, patch
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from usuarios.models import Usuario
from .pdf import generar_pdf_cotizacion
from .views import CotizacionViewSet


class DocumentPdfTests(SimpleTestCase):
    # Prepara los usuarios, datos y servicios simulados necesarios para cada prueba.
    def setUp(self):
        self.record = SimpleNamespace(pk=42, ruta_pdf_cotizacion="", save=Mock())
        self.factory = APIRequestFactory()
        self.user = Usuario(id=1, id_rol=1, activo=True)

    # Invoca una acción de cotizaciones con una solicitud simulada y autenticación opcional.
    def request(self, action, method="get", authenticated=True):
        request = getattr(self.factory, method)("/api/cotizaciones/42/pdf/")
        if authenticated:
            force_authenticate(request, user=self.user)
        with patch.object(CotizacionViewSet, "get_object", return_value=self.record):
            return CotizacionViewSet.as_view({method: action})(request, pk=42)

    # Comprueba que las acciones de PDF exigen autenticación.
    def test_requires_authentication(self):
        self.assertIn(self.request("obtener_pdf", authenticated=False).status_code, (401, 403))

    # Comprueba que consultar un PDF inexistente devuelve HTTP 404.
    def test_missing_document(self):
        self.assertEqual(self.request("obtener_pdf").status_code, 404)

    # Comprueba que el enlace firmado dura cinco minutos y la respuesta no se almacena en caché.
    @patch("cotizaciones.views.obtener_cliente_supabase")
    def test_signed_url_is_temporary_and_not_cached(self, client):
        self.record.ruta_pdf_cotizacion = "cotizaciones/42/test.pdf"
        bucket = client.return_value.storage.from_.return_value
        bucket.create_signed_url.return_value = {"signedURL": "https://storage.example/test?token=secret"}
        response = self.request("obtener_pdf")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "no-store")
        bucket.create_signed_url.assert_called_once_with(self.record.ruta_pdf_cotizacion, 300)

    # Comprueba que el PDF se sube y su ruta queda vinculada a la cotización.
    @patch("cotizaciones.views.generar_pdf_cotizacion", return_value=b"%PDF-test")
    @patch("cotizaciones.views.obtener_cliente_supabase")
    def test_upload_and_association(self, client, generate):
        response = self.request("generar_pdf", "post")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.record.ruta_pdf_cotizacion.startswith("cotizaciones/42/"))
        self.record.save.assert_called_once_with(update_fields=["ruta_pdf_cotizacion"])

    # Comprueba que un fallo al subir el PDF no vincula una ruta inexistente.
    @patch("cotizaciones.views.generar_pdf_cotizacion", return_value=b"%PDF-test")
    @patch("cotizaciones.views.obtener_cliente_supabase")
    def test_upload_failure_does_not_associate(self, client, generate):
        client.return_value.storage.from_.return_value.upload.side_effect = RuntimeError("Storage unavailable")
        with self.assertLogs("cotizaciones.views", level="ERROR"):
            response = self.request("generar_pdf", "post")
        self.assertEqual(response.status_code, 502)
        self.record.save.assert_not_called()
        self.assertEqual(self.record.ruta_pdf_cotizacion, "")

    # Comprueba que editar una cotización invalida su PDF anterior.
    def test_edit_invalidates_previous_pdf(self):
        serializer = Mock()
        CotizacionViewSet().perform_update(serializer)
        serializer.save.assert_called_once_with(ruta_pdf_cotizacion="")

    # Comprueba que el generador acepta acentos y caracteres de marcado y produce un PDF completo.
    def test_renderer_handles_accents_and_markup(self):
        details = Mock()
        details.all.return_value.order_by.return_value = [SimpleNamespace(
            descripcion_dc="Polímero <especial> & agrícola", cantidad_dc=2,
            precio_unitario_dc=1000, subtotal_dc=2000)]
        record = SimpleNamespace(
            numero_cotizacion="COT-0042", fecha_cotizacion=date(2026, 10, 25),
            vigencia_cotizacion=date(2026, 11, 25),
            id_cliente=SimpleNamespace(razon_social="Cliente & Compañía", rut="12345678-9"),
            condicion_pago_cotizacion="30 días", estado_cotizacion="Borrador",
            detallecotizacion_set=details, subtotal_cotizacion=2000,
            iva_cotizacion=380, total_cotizacion=2380, observacion_cotizacion="Observación <prueba>")
        content = generar_pdf_cotizacion(record)
        self.assertTrue(content.startswith(b"%PDF-"))
        self.assertIn(b"%%EOF", content)
