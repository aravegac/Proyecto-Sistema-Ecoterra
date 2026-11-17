"""API, autenticación, base local y PDF reales; solo Storage se simula."""
from io import BytesIO
from unittest.mock import patch

from django.test import TestCase
from config.test_support import SalesTablesMixin
from pypdf import PdfReader
from rest_framework.test import APIClient

from clientes.models import Cliente
from inventario.models import Producto
from usuarios.models import Usuario
from usuarios.authentication import crear_token
from facturacion.models import Factura, DetalleFactura
from ventas.models import OrdenCompra
from .models import Cotizacion, DetalleCotizacion


class PdfIntegrationTests(SalesTablesMixin, TestCase):
    # Prepara los usuarios, datos y servicios simulados necesarios para cada prueba.
    def setUp(self):
        self.api = APIClient()
        self.user = Usuario.objects.create(nombre="Admin pruebas", email="pdf@example.com", id_rol=1)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {crear_token(self.user)}")
        self.customer = Cliente.objects.create(rut="76.123.456-7", razon_social="Cliente & Compañía",
                                                ciudad="Santiago", telefono="123", email="test@example.com")
        self.product = Producto.objects.create(codigo="PDF-001", nombre="Polímero agrícola",
                                               tipo="Control", unidad="Litros")
        self.order = OrdenCompra.objects.create(id_cliente=self.customer, numero_oc="OC-TEST-01",
                                                fecha_oc="2026-10-25", ruta_documento_oc="")
        self.files = {}
        self.storage_patch = patch("facturacion.views.obtener_cliente_supabase")
        self.quote_storage_patch = patch("cotizaciones.views.obtener_cliente_supabase")
        client = self.storage_patch.start()
        self.addCleanup(self.storage_patch.stop)
        quote_client = self.quote_storage_patch.start()
        self.addCleanup(self.quote_storage_patch.stop)
        self.bucket = client.return_value.storage.from_.return_value
        quote_client.return_value.storage.from_.return_value = self.bucket
        # Simula una subida guardando los bytes del documento bajo su ruta en memoria.
        self.bucket.upload.side_effect = lambda path, content, **kwargs: self.files.update({path: content})
        # Simula un enlace firmado que incluye la ruta del archivo y el tiempo de vigencia recibido.
        self.bucket.create_signed_url.side_effect = lambda path, ttl: {"signedURL": f"https://storage.example/{path}?ttl={ttl}"}

    # Crea una cotización de prueba con la cantidad indicada de líneas y devuelve su URL y modelo.
    def create_quote(self, lines=1):
        response = self.api.post("/api/cotizaciones/", {
            "id_cliente": self.customer.pk, "fecha_cotizacion": "2026-10-25",
            "dias_vigencia_cotizacion": 30, "vigencia_cotizacion": "2026-11-24",
            "condicion_pago_cotizacion": "30 días", "estado_cotizacion": "Borrador",
            "subtotal_cotizacion": 2000*lines, "iva_cotizacion": 380*lines,
            "total_cotizacion": 2380*lines, "observacion_cotizacion": "Observación <especial> & válida",
            "detalles": [{"id_producto": self.product.pk, "descripcion_dc": f"Polímero agrícola {i+1}",
                          "cantidad_dc": 2, "precio_unitario_dc": 1000, "subtotal_dc": 2000}
                         for i in range(lines)],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return f"/api/cotizaciones/{response.data['id_cotizacion']}", Cotizacion.objects.get(pk=response.data["id_cotizacion"])

    # Crea una factura de prueba mediante la API y devuelve su URL y modelo.
    def create_invoice(self):
        response = self.api.post("/api/facturas/", {
            "cliente_id": self.customer.pk, "id_oc": self.order.pk,
            "ruta_pdf_factura": "archivo-ajeno.pdf",
            "detalles": [{"id_producto": self.product.pk, "cantidad": 2, "precio_unitario": 1000}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Factura.objects.get(pk=response.data["id"])
        self.assertEqual(invoice.ruta_pdf_factura, "")
        return f"/api/facturas/{invoice.pk}", invoice

    # Genera el PDF de prueba y verifica su almacenamiento, contenido y enlace firmado sin caché.
    def generate(self, base, record, field):
        self.assertEqual(self.api.get(f"{base}/pdf/").status_code, 404)
        response = self.api.post(f"{base}/generar-pdf/")
        self.assertEqual(response.status_code, 200, response.data)
        record.refresh_from_db()
        path = getattr(record, field)
        self.assertIn(path, self.files)
        pdf = PdfReader(BytesIO(self.files[path]))
        text = "\n".join(page.extract_text() for page in pdf.pages)
        total_esperado = "2,380.00" if isinstance(record, Factura) else "$2.380,00"
        for expected in ("Cliente & Compañía", "Polímero agrícola", total_esperado):
            self.assertIn(expected, text)
        response = self.api.get(f"{base}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(path, response.data["url"])
        self.assertEqual(response["Cache-Control"], "no-store")
        return path

    # Comprueba que una cotización puede crearse, generar y consultar su PDF y regenerarlo después de editarse.
    def test_quote_create_generate_consult_edit_regenerate(self):
        base, quote = self.create_quote()
        previous = self.generate(base, quote, "ruta_pdf_cotizacion")
        response = self.api.patch(f"{base}/", {"observacion_cotizacion": "Nueva versión"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        quote.refresh_from_db()
        self.assertEqual(quote.ruta_pdf_cotizacion, "")
        current = self.generate(base, quote, "ruta_pdf_cotizacion")
        self.assertNotEqual(previous, current)
        self.assertIn(previous, self.files)

    # Comprueba que una factura puede crearse y generar y consultar su PDF.
    def test_invoice_create_generate_consult(self):
        base, invoice = self.create_invoice()
        self.generate(base, invoice, "ruta_pdf_factura")

    # Comprueba que cambiar el estado invalida el PDF y permite generar uno nuevo.
    def test_invoice_state_change_invalidates_pdf(self):
        base, invoice = self.create_invoice()
        self.generate(base, invoice, "ruta_pdf_factura")
        response = self.api.patch(f"{base}/acciones/", {"estado": "PAGADA"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.api.get(f"{base}/pdf/").status_code, 404)
        self.assertEqual(self.api.post(f"{base}/generar-pdf/").status_code, 200)
        invoice.refresh_from_db()
        pdf = PdfReader(BytesIO(self.files[invoice.ruta_pdf_factura]))
        self.assertEqual(invoice.estado, "PAGADA")
        self.assertIn(invoice.numero_factura, pdf.pages[0].extract_text())

    # Comprueba que el PDF multipágina conserva el último producto, los totales y la numeración.
    def test_multipage_quote_keeps_last_product_and_totals(self):
        base, quote = self.create_quote(lines=90)
        self.assertEqual(self.api.post(f"{base}/generar-pdf/").status_code, 200)
        quote.refresh_from_db()
        pdf = PdfReader(BytesIO(self.files[quote.ruta_pdf_cotizacion]))
        self.assertGreater(len(pdf.pages), 1)
        text = "\n".join(page.extract_text() for page in pdf.pages)
        self.assertIn("Polímero agrícola 90", text)
        self.assertIn("$214.200,00", text)
        for number, page in enumerate(pdf.pages, 1):
            self.assertIn(f"Página {number}", page.extract_text())

    # Comprueba que las solicitudes sin sesión o con token inválido se rechazan.
    def test_anonymous_and_invalid_token_are_denied(self):
        base, _ = self.create_quote()
        anonymous = APIClient()
        for route in (f"{base}/pdf/", "/api/facturas/999/pdf/"):
            self.assertEqual(anonymous.get(route).status_code, 401)
            anonymous.credentials(HTTP_AUTHORIZATION="Bearer invalid")
            self.assertEqual(anonymous.get(route).status_code, 401)
            anonymous.credentials()

    # Comprueba que un usuario sin permiso no puede consultar ni generar PDF.
    def test_user_without_permission_cannot_read_or_generate(self):
        base, _ = self.create_quote()
        user = Usuario.objects.create(nombre="Sin permisos", email="denied@example.com", id_rol=3)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {crear_token(user)}")
        with patch("usuarios.permissions.tiene_permiso", return_value=False):
            for prefix in (base, "/api/facturas/999"):
                self.assertEqual(self.api.get(f"{prefix}/pdf/").status_code, 403)
                self.assertEqual(self.api.post(f"{prefix}/generar-pdf/").status_code, 403)
        self.bucket.upload.assert_not_called()

    # Comprueba que un fallo de Storage conserva la asociación anterior del documento.
    def test_storage_failure_preserves_previous_association(self):
        for create, field in ((self.create_quote, "ruta_pdf_cotizacion"), (self.create_invoice, "ruta_pdf_factura")):
            base, record = create()
            original = self.generate(base, record, field)
            self.bucket.upload.side_effect = RuntimeError("Storage unavailable")
            with self.assertLogs(level="ERROR"):
                response = self.api.post(f"{base}/generar-pdf/")
            self.assertGreaterEqual(response.status_code, 500)
            record.refresh_from_db()
            self.assertEqual(getattr(record, field), original)
            # Restablece la subida simulada guardando los bytes por ruta después de probar el fallo de Storage.
            self.bucket.upload.side_effect = lambda path, content, **kwargs: self.files.update({path: content})
