from datetime import date
from decimal import Decimal
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile

from django.apps import apps
from django.test import TestCase
from rest_framework.test import APIClient

from clientes.models import Cliente
from config.test_support import SalesTablesMixin
from facturacion.models import Factura
from usuarios.authentication import crear_token
from usuarios.models import Usuario
from .models import OrdenCompra


class OrdenCompraDocumentoTests(SalesTablesMixin, TestCase):
    def setUp(self):
        self.api = APIClient()
        self.usuario = Usuario.objects.create(nombre="Admin", email="documentos@example.com", id_rol=1)
        self.api.force_authenticate(user=self.usuario)
        self.cliente = Cliente.objects.create(
            rut="11111111-1", razon_social="Cliente OC", ciudad="Santiago",
            telefono="123", email="cliente@example.com",
        )
        self.storage_patch = patch("ventas.views.obtener_cliente_supabase")
        self.bucket = self.storage_patch.start().return_value.storage.from_.return_value
        self.addCleanup(self.storage_patch.stop)
        self.bucket.create_signed_url.return_value = {"signedURL": "https://storage.example/oc.pdf"}

    def archivo(self, content=b"%PDF-1.4\nDocumento de prueba"):
        return SimpleUploadedFile("orden.pdf", content, content_type="application/pdf")

    def crear(self, ruta="ordenes-compra", fecha="fecha_oc"):
        return self.api.post(f"/api/{ruta}/", {
            "id_cliente": self.cliente.pk, "numero_oc": f"OC-{ruta}",
            fecha: "2026-11-04", "tipo_operacion_oc": "Internacional",
            "archivo": self.archivo(),
        }, format="multipart")

    def test_carga_y_consulta_documento_en_ambas_rutas(self):
        for ruta, fecha, identificador in [
            ("ordenes-compra", "fecha_oc", "id_oc"),
            ("orden-compras", "fecha_orden", "id"),
        ]:
            with self.subTest(ruta=ruta):
                response = self.crear(ruta, fecha)
                self.assertEqual(response.status_code, 201, response.data)
                orden = OrdenCompra.objects.get(pk=response.data[identificador])
                self.assertEqual(orden.tipo_operacion_oc, "Internacional")
                self.assertTrue(orden.ruta_documento_oc.startswith("ordenes-compra/"))
                response = self.api.get(f"/api/{ruta}/{orden.pk}/documento/")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response["Cache-Control"], "no-store")
                self.bucket.create_signed_url.assert_called_with(orden.ruta_documento_oc, 300)

    def test_reemplazo_actualiza_registro_y_fallo_posterior_conserva_documento(self):
        response = self.crear()
        self.assertEqual(response.status_code, 201)
        orden = OrdenCompra.objects.get()
        original = orden.ruta_documento_oc
        url = f"/api/ordenes-compra/{orden.pk}/"
        response = self.api.patch(url, {
            "numero_oc": "OC-EDITADA", "tipo_operacion_oc": "Nacional",
            "archivo": self.archivo(),
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        orden.refresh_from_db()
        self.assertNotEqual(original, orden.ruta_documento_oc)
        self.assertEqual(orden.numero_oc, "OC-EDITADA")
        self.assertEqual(orden.tipo_operacion_oc, "Nacional")
        anterior = orden.ruta_documento_oc
        self.bucket.upload.side_effect = RuntimeError("Storage no disponible")
        with self.assertLogs("ventas.views", level="ERROR"):
            response = self.api.patch(url, {"numero_oc": "NO-GUARDAR", "archivo": self.archivo()}, format="multipart")
        self.assertEqual(response.status_code, 502)
        orden.refresh_from_db()
        self.assertEqual(orden.ruta_documento_oc, anterior)
        self.assertEqual(orden.numero_oc, "OC-EDITADA")

    def test_pdf_invalido_y_tipo_invalido_no_se_guardan(self):
        response = self.api.post("/api/ordenes-compra/", {
            "id_cliente": self.cliente.pk, "numero_oc": "INVALIDA", "fecha_oc": "2026-11-04",
            "archivo": self.archivo(b"contenido de texto"),
        }, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("archivo", response.data)
        response = self.api.post("/api/ordenes-compra/", {
            "id_cliente": self.cliente.pk, "numero_oc": "INVALIDA", "fecha_oc": "2026-11-04",
            "tipo_operacion_oc": "Otro", "archivo": self.archivo(),
        }, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(OrdenCompra.objects.exists())
        self.bucket.upload.assert_not_called()

    def test_carga_fallida_no_crea_orden(self):
        self.bucket.upload.side_effect = RuntimeError("Storage no disponible")
        with self.assertLogs("ventas.views", level="ERROR"):
            response = self.crear()
        self.assertEqual(response.status_code, 502)
        self.assertFalse(OrdenCompra.objects.exists())

    def test_retira_pdf_si_el_guardado_del_registro_falla(self):
        from rest_framework.exceptions import ValidationError

        with patch("ventas.serializers.OrdenCompraSerializer.create", side_effect=ValidationError("Conflicto")):
            response = self.crear()
        self.assertEqual(response.status_code, 400)
        ruta = self.bucket.upload.call_args.args[0]
        self.bucket.remove.assert_called_once_with([ruta])
        self.assertFalse(OrdenCompra.objects.exists())

    def test_filtros_y_bloqueo_de_cliente_y_tipo_en_orden_facturada(self):
        sin_factura = OrdenCompra.objects.create(
            id_cliente=self.cliente, numero_oc="SIN-F", fecha_oc="2026-11-04", ruta_documento_oc="oc.pdf",
        )
        facturada = OrdenCompra.objects.create(
            id_cliente=self.cliente, numero_oc="CON-F", fecha_oc="2026-11-04", ruta_documento_oc="oc2.pdf",
        )
        Factura.objects.create(
            id_orden_compra=facturada, id_cliente=self.cliente, numero_factura="F-OC",
            subtotal=100, iva=19, total=119,
        )
        response = self.api.get(f"/api/ordenes-compra/?cliente_id={self.cliente.pk}&con_factura=true")
        self.assertEqual([item["id_oc"] for item in response.data], [facturada.pk])
        self.assertEqual(response.data[0]["factura_numero"], "F-OC")
        response = self.api.get("/api/ordenes-compra/?con_factura=false")
        self.assertEqual([item["id_oc"] for item in response.data], [sin_factura.pk])
        response = self.api.patch(
            f"/api/ordenes-compra/{facturada.pk}/", {"tipo_operacion_oc": "Internacional"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        facturada.refresh_from_db()
        self.assertEqual(facturada.tipo_operacion_oc, "Nacional")
        otro = Cliente.objects.create(
            rut="22222222-2", razon_social="Otro cliente", ciudad="Santiago", telefono="456", email="otro@example.com",
        )
        response = self.api.patch(
            f"/api/ordenes-compra/{facturada.pk}/", {"id_cliente": otro.pk}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_documento_exige_autenticacion(self):
        response = self.crear()
        pk = response.data["id_oc"]
        self.assertEqual(APIClient().get(f"/api/ordenes-compra/{pk}/documento/").status_code, 401)


class DistribucionVentasTests(SalesTablesMixin, TestCase):
    # Prepara el cliente autenticado y los datos necesarios para cada prueba.
    def setUp(self):
        self.api = APIClient()
        admin = Usuario.objects.create(
            nombre="Admin ventas", email="ventas@example.com", id_rol=1,
        )
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {crear_token(admin)}")
        self.cliente = Cliente.objects.create(
            rut="76123456-7", razon_social="Cliente ventas", ciudad="Santiago",
            telefono="123", email="cliente-ventas@example.com",
        )

    # Comprueba que orden_compra y factura tienen un único modelo registrado y una relación canónica.
    def test_tablas_tienen_un_solo_modelo_registrado(self):
        for tabla, esperado in (("orden_compra", OrdenCompra), ("factura", Factura)):
            modelos = [model for model in apps.get_models() if model._meta.db_table == tabla]
            self.assertEqual(modelos, [esperado])
        self.assertIs(Factura._meta.get_field("id_orden_compra").related_model, OrdenCompra)

    # Comprueba que las dos rutas de órdenes crean y consultan el mismo modelo con sus alias respectivos.
    def test_ambas_rutas_crean_y_consultan_el_mismo_modelo(self):
        for ruta, fecha, identificador in (
            ("ordenes-compra", "fecha_oc", "id_oc"),
            ("orden-compras", "fecha_orden", "id"),
        ):
            with self.subTest(ruta=ruta):
                respuesta = self.api.post(f"/api/{ruta}/", {
                    "id_cliente": self.cliente.pk, "numero_oc": f"OC-{ruta}",
                    fecha: "2026-10-25", "ruta_documento_oc": "orden.pdf",
                }, format="json")
                self.assertEqual(respuesta.status_code, 201, respuesta.data)
                orden = OrdenCompra.objects.get(pk=respuesta.data[identificador])
                self.assertEqual(orden.fecha_oc, date(2026, 10, 25))
                for consulta in ("ordenes-compra", "orden-compras"):
                    respuesta = self.api.get(f"/api/{consulta}/{orden.pk}/")
                    self.assertEqual(respuesta.status_code, 200, respuesta.data)
                    self.assertEqual(respuesta.data["numero_oc"], orden.numero_oc)

    # Comprueba que las dos rutas impiden eliminar órdenes con factura asociada.
    def test_ambas_rutas_protegen_ordenes_facturadas(self):
        orden = OrdenCompra.objects.create(
            id_cliente=self.cliente, numero_oc="OC-FACTURADA",
            fecha_oc=date(2026, 10, 25), ruta_documento_oc="orden.pdf",
        )
        Factura.objects.create(
            id_orden_compra=orden, id_cliente=self.cliente, numero_factura="F-TEST",
            subtotal=Decimal("100"), iva=Decimal("19"), total=Decimal("119"),
        )
        for ruta in ("ordenes-compra", "orden-compras"):
            respuesta = self.api.delete(f"/api/{ruta}/{orden.pk}/")
            self.assertEqual(respuesta.status_code, 400, respuesta.data)
        self.assertTrue(OrdenCompra.objects.filter(pk=orden.pk).exists())

    # Comprueba que la ruta histórica de órdenes exige autenticación.
    def test_ruta_historica_exige_autenticacion(self):
        self.assertEqual(APIClient().get("/api/orden-compras/").status_code, 401)

    # Comprueba que una nota de crédito se crea y consulta vinculada al modelo canónico de factura.
    def test_nota_credito_usa_factura_canonica(self):
        orden = OrdenCompra.objects.create(
            id_cliente=self.cliente, numero_oc="OC-NC",
            fecha_oc=date(2026, 10, 25), ruta_documento_oc="orden.pdf",
        )
        factura = Factura.objects.create(
            id_orden_compra=orden, id_cliente=self.cliente, numero_factura="F-NC",
            subtotal=Decimal("100"), iva=Decimal("19"), total=Decimal("119"),
        )
        respuesta = self.api.post("/api/notas-credito/", {
            "id_factura": factura.pk, "numero_nc": "NC-TEST",
            "fecha_emision": "2026-10-26", "subtotal_bruto": "100.00",
            "motivo": "Prueba de integracion",
        }, format="json")
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data["factura_total"], "119.00")
        self.assertEqual(respuesta.data["total"], "119.00")
        respuesta = self.api.get("/api/notas-credito/", {"factura_id": factura.pk})
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(len(respuesta.data), 1)
