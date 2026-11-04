from datetime import date
from decimal import Decimal
from io import BytesIO
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
from .models import OrdenCompra, NotaCredito
from pypdf import PdfReader


class NotaCreditoMonedaTests(SalesTablesMixin, TestCase):
    @patch("ventas.views.obtener_cliente_supabase")
    def test_pdf_con_motivo_largo_conserva_el_final(self, storage):
        response = self.crear_nota(
            self.factura("USD", "Internacional"),
            motivo=("Detalle del ajuste de la nota de crédito.\n" * 150) + "FIN DEL MOTIVO",
        )
        self.assertEqual(response.status_code, 201, response.data)
        response = self.api.post(f"/api/notas-credito/{response.data['id']}/generar-pdf/")
        self.assertEqual(response.status_code, 200)
        content = storage.return_value.storage.from_.return_value.upload.call_args.args[1]
        pdf = PdfReader(BytesIO(content))
        self.assertGreater(len(pdf.pages), 1)
        self.assertLessEqual(len(pdf.pages), 5)
        self.assertIn("FIN DEL MOTIVO", "\n".join(page.extract_text() for page in pdf.pages))

    def setUp(self):
        self.api = APIClient()
        self.user = Usuario.objects.create(nombre="Admin NC", email="nc-moneda@example.com", id_rol=1)
        self.api.force_authenticate(user=self.user)
        self.cliente = Cliente.objects.create(
            rut="11111111-1", razon_social="Cliente NC", ciudad="Santiago",
            telefono="123", email="nc@example.com",
        )

    def factura(self, moneda="CLP", operacion="Nacional", estado="EMITIDA"):
        index = Factura.objects.count() + 1
        orden = OrdenCompra.objects.create(
            id_cliente=self.cliente, numero_oc=f"OC-NC-{index}", fecha_oc=date(2026, 11, 4),
            ruta_documento_oc="oc.pdf", tipo_operacion_oc=operacion,
        )
        iva = 19000 if operacion == "Nacional" else 0
        return Factura.objects.create(
            id_cliente=self.cliente, id_orden_compra=orden, numero_factura=f"F-NC-{index}",
            estado=estado, subtotal=100000, iva=iva, total=100000 + iva, moneda_factura=moneda,
        )

    def crear_nota(self, factura, **attrs):
        return self.api.post("/api/notas-credito/", {
            "id_factura": factura.pk, "numero_nc": f"NC-{NotaCredito.objects.count() + 1}",
            "fecha_emision": "2026-11-04", "motivo": "Ajuste <cliente> & recepción",
            "subtotal_bruto": "100000.00", "estado": "PENDIENTE", **attrs,
        }, format="json")

    @patch("ventas.views.obtener_cliente_supabase")
    def test_moneda_y_operacion_heredadas_en_los_cuatro_casos_y_pdf(self, storage):
        bucket = storage.return_value.storage.from_.return_value
        for moneda in ["CLP", "USD"]:
            for operacion in ["Nacional", "Internacional"]:
                with self.subTest(moneda=moneda, operacion=operacion):
                    factura = self.factura(moneda, operacion)
                    response = self.crear_nota(
                        factura, moneda="EUR", tipo_operacion="Otro", iva=1, total=1,
                    )
                    self.assertEqual(response.status_code, 201, response.data)
                    self.assertEqual(response.data["moneda"], moneda)
                    self.assertEqual(response.data["tipo_operacion"], operacion)
                    self.assertEqual(response.data["iva"], "19000.00" if operacion == "Nacional" else "0.00")
                    self.assertEqual(response.data["total"], "119000.00" if operacion == "Nacional" else "100000.00")
                    nota = NotaCredito.objects.get(pk=response.data["id"])
                    self.assertEqual(nota.moneda, moneda)
                    self.assertEqual(nota.tipo_operacion, operacion)
                    response = self.api.post(f"/api/notas-credito/{nota.pk}/generar-pdf/")
                    self.assertEqual(response.status_code, 200, response.data)
                    content = bucket.upload.call_args.args[1]
                    pdf = PdfReader(BytesIO(content))
                    self.assertGreater(len(pdf.pages[0].images), 0)
                    text = "\n".join(page.extract_text() for page in pdf.pages)
                    for expected in [
                        nota.numero_nc, factura.numero_factura, f"Moneda: {moneda}",
                        f"Tipo de operación: {operacion}", "Ajuste <cliente> & recepción",
                        "IVA (19%)" if operacion == "Nacional" else "IVA (0%)",
                    ]:
                        self.assertIn(expected, text)

    def test_facturas_pendientes_y_anuladas_no_admiten_notas(self):
        for state in ["PENDIENTE", "ANULADA"]:
            response = self.crear_nota(self.factura(estado=state))
            self.assertEqual(response.status_code, 400)
        self.assertFalse(NotaCredito.objects.exists())
        self.assertEqual(self.crear_nota(self.factura(estado="PAGADA")).status_code, 201)

    def test_actualizacion_recalcula_con_la_factura_de_origen(self):
        response = self.crear_nota(self.factura("USD", "Nacional"))
        self.assertEqual(response.status_code, 201)
        nota = NotaCredito.objects.get(pk=response.data["id"])
        otra = self.factura("CLP", "Internacional")
        response = self.api.patch(f"/api/notas-credito/{nota.pk}/", {
            "id_factura": otra.pk, "subtotal_bruto": "50000",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        nota.refresh_from_db()
        self.assertEqual(nota.moneda, "CLP")
        self.assertEqual(nota.tipo_operacion, "Internacional")
        self.assertEqual(nota.total, Decimal("50000"))
        self.assertEqual(nota.iva, Decimal("0"))

    def test_iva_redondeado_y_total_fuera_de_limite(self):
        factura = self.factura()
        response = self.crear_nota(factura, subtotal_bruto="0.50")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["iva"], "0.10")
        response = self.crear_nota(factura, subtotal_bruto="9999999999.99")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(NotaCredito.objects.count(), 1)

    def test_nota_antigua_impide_cambiar_moneda_de_factura_pendiente(self):
        factura = self.factura(estado="PENDIENTE")
        NotaCredito.objects.create(
            id_factura=factura, numero_nc="NC-ANTIGUA", fecha_emision=date(2026, 11, 4),
            subtotal=100, iva=19, total=119, motivo="Registro antiguo",
        )
        response = self.api.patch(f"/api/facturas/{factura.pk}/", {"moneda_factura": "USD"}, format="json")
        self.assertEqual(response.status_code, 400)
        factura.refresh_from_db()
        self.assertEqual(factura.moneda_factura, "CLP")


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
            subtotal=Decimal("100"), iva=Decimal("19"), total=Decimal("119"), estado="EMITIDA",
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
