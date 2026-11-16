from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch
from django.test import SimpleTestCase
from rest_framework.test import APITestCase, APIRequestFactory, force_authenticate
from clientes.models import Cliente
from config.test_support import SalesTablesMixin
from .models import Cotizacion
from usuarios.models import Usuario
from .pdf import generar_pdf_cotizacion
from .views import CotizacionViewSet
from django.utils import timezone
from ventas.models import OrdenCompra
from inventario.models import Producto


class CotizacionEstadosTests(SalesTablesMixin, APITestCase):
    def setUp(self):
        self.usuario = Usuario.objects.create(nombre="Admin", email="estados@example.com", id_rol=1)
        self.client.force_authenticate(user=self.usuario)
        self.cliente = Cliente.objects.create(
            rut="11111111-1", razon_social="Cliente estados",
            ciudad="Santiago", telefono="123", email="cliente@example.com",
        )

    def cotizacion(self, estado="Vigente", vencida=False):
        hoy = timezone.localdate()
        return Cotizacion.objects.create(
            id_cliente=self.cliente,
            numero_cotizacion=f"EST-{Cotizacion.objects.count()}",
            fecha_cotizacion=hoy,
            dias_vigencia_cotizacion=30,
            vigencia_cotizacion=hoy + timedelta(days=-1 if vencida else 30),
            condicion_pago_cotizacion="Contado",
            subtotal_cotizacion=1000, iva_cotizacion=190, total_cotizacion=1190,
            estado_cotizacion=estado, ruta_pdf_cotizacion="",
        )

    def anular(self, cotizacion, **datos):
        return self.client.post(
            f"/api/cotizaciones/{cotizacion.pk}/anular/",
            {"motivo_anulacion": "  Error administrativo  ", **datos},
            format="json",
        )

    def test_anulacion_conserva_registro_y_auditoria_del_usuario_autenticado(self):
        for estado in ["Borrador", "Vigente", "Vencida", "Aceptada"]:
            with self.subTest(estado=estado):
                cotizacion = self.cotizacion(estado)
                response = self.anular(cotizacion, id_usuario_anulacion=999)
                self.assertEqual(response.status_code, 200, response.data)
                cotizacion.refresh_from_db()
                self.assertEqual(cotizacion.estado_cotizacion, "Anulada")
                self.assertEqual(cotizacion.motivo_anulacion, "Error administrativo")
                self.assertEqual(cotizacion.id_usuario_anulacion, self.usuario.pk)
                self.assertIsNotNone(cotizacion.fecha_anulacion)
                fecha = cotizacion.fecha_anulacion
                self.assertEqual(self.anular(cotizacion).status_code, 400)
                cotizacion.refresh_from_db()
                self.assertEqual(cotizacion.fecha_anulacion, fecha)

    def test_motivo_obligatorio_y_estado_rechazado_no_admiten_anulacion(self):
        cotizacion = self.cotizacion()
        self.assertEqual(self.anular(cotizacion, motivo_anulacion=" ").status_code, 400)
        self.assertEqual(self.anular(self.cotizacion("Rechazada")).status_code, 400)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado_cotizacion, "Vigente")

    def test_permiso_eliminar_y_excepcion_de_aceptada_solo_admin(self):
        usuario = Usuario.objects.create(
            nombre="Operador", email="operador@example.com", id_rol=2,
            permisos={"cotizaciones:Crear": True, "cotizaciones:Eliminar": False},
        )
        self.client.force_authenticate(user=usuario)
        cotizacion = self.cotizacion()
        self.assertEqual(self.anular(cotizacion).status_code, 403)
        usuario.permisos["cotizaciones:Eliminar"] = True
        self.assertEqual(self.anular(cotizacion).status_code, 200)
        self.assertEqual(self.anular(self.cotizacion("Aceptada")).status_code, 403)

    def test_estados_finales_y_vencidas_no_permiten_edicion_ni_borrado(self):
        for estado in ["Aceptada", "Convertida", "Rechazada", "Anulada", "Vencida"]:
            with self.subTest(estado=estado):
                cotizacion = self.cotizacion(estado)
                url = f"/api/cotizaciones/{cotizacion.pk}/"
                response = self.client.patch(url, {"observacion_cotizacion": "Cambio"}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(self.client.delete(url).status_code, 405)
                self.assertTrue(Cotizacion.objects.filter(pk=cotizacion.pk).exists())

    def test_anulada_no_puede_asignarse_por_edicion_directa(self):
        cotizacion = self.cotizacion()
        response = self.client.patch(
            f"/api/cotizaciones/{cotizacion.pk}/",
            {"estado_cotizacion": "Anulada", "motivo_anulacion": "Sin acción de anulación"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        cotizacion.refresh_from_db()
        self.assertIsNone(cotizacion.fecha_anulacion)

    def test_transiciones_de_borrador_y_vigente(self):
        cotizacion = self.cotizacion("Borrador")
        url = f"/api/cotizaciones/{cotizacion.pk}/"
        self.assertEqual(self.client.patch(url, {"estado_cotizacion": "Aceptada"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"estado_cotizacion": "Vigente"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url, {"estado_cotizacion": "Borrador"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"estado_cotizacion": "Aceptada"}, format="json").status_code, 200)

    def test_vigencia_expirada_se_muestra_vencida_y_bloquea_edicion(self):
        cotizacion = self.cotizacion(vencida=True)
        url = f"/api/cotizaciones/{cotizacion.pk}/"
        self.assertEqual(self.client.get(url).data["estado_cotizacion"], "Vencida")
        self.assertEqual(self.client.patch(url, {"observacion_cotizacion": "Cambio"}, format="json").status_code, 400)
        self.assertEqual(self.anular(cotizacion).status_code, 200)

    def test_vinculo_comercial_solo_aceptadas_en_ambas_rutas_y_bloquea_anulacion(self):
        for ruta, campo_fecha in [("ordenes-compra", "fecha_oc"), ("orden-compras", "fecha_orden")]:
            for estado in ["Borrador", "Vigente", "Vencida", "Aceptada", "Convertida", "Rechazada", "Anulada"]:
                with self.subTest(ruta=ruta, estado=estado):
                    cotizacion = self.cotizacion(estado)
                    response = self.client.post(f"/api/{ruta}/", {
                        "id_cliente": self.cliente.pk,
                        "id_cotizacion": cotizacion.pk,
                        "numero_oc": f"OC-{cotizacion.pk}",
                        campo_fecha: str(timezone.localdate()),
                        "ruta_documento_oc": "orden-prueba.pdf",
                    }, format="json")
                    self.assertEqual(response.status_code, 201 if estado in {"Aceptada", "Convertida"} else 400, response.data)
                    if estado in {"Aceptada", "Convertida"}:
                        self.assertEqual(self.anular(cotizacion).status_code, 400)

    def test_factura_rechaza_oc_con_cotizacion_anulada_incluso_en_datos_antiguos(self):
        cotizacion = self.cotizacion("Anulada")
        orden = OrdenCompra.objects.create(
            id_cliente=self.cliente, id_cotizacion=cotizacion, numero_oc="LEGACY",
            fecha_oc=timezone.localdate(), ruta_documento_oc="",
        )
        producto = Producto.objects.create(codigo="EST", nombre="Producto", tipo="Insumo", unidad="L")
        response = self.client.post("/api/facturas/", {
            "cliente_id": self.cliente.pk, "id_oc": orden.pk,
            "detalles": [{"id_producto": producto.pk, "cantidad": 1, "precio_unitario": 100}],
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)


class CotizacionListadoTests(SalesTablesMixin, APITestCase):
    def test_listado_devuelve_el_estado_real_de_cada_cotizacion(self):
        cliente = Cliente.objects.create(
            rut="11111111-1", razon_social="Cliente listado",
            ciudad="Santiago", telefono="123456", email="listado@example.com",
        )
        estados = ["Borrador", "Vigente", "Vencida", "Aceptada", "Rechazada", "Anulada", "Convertida"]
        for index, estado in enumerate(estados):
            Cotizacion.objects.create(
                id_cliente=cliente,
                numero_cotizacion=f"COT-TEST-{index}",
                fecha_cotizacion=date(2026, 11, 4),
                dias_vigencia_cotizacion=30,
                vigencia_cotizacion=timezone.localdate() + timedelta(days=30),
                condicion_pago_cotizacion="Contado",
                subtotal_cotizacion=1000,
                iva_cotizacion=190,
                total_cotizacion=1190,
                estado_cotizacion=estado,
                ruta_pdf_cotizacion="",
            )
        self.client.force_authenticate(user=Usuario(id=1, id_rol=1, activo=True))
        response = self.client.get("/api/cotizaciones/")
        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(
            [item["estado_cotizacion"] for item in response.data],
            ["Aceptada" if estado == "Convertida" else estado for estado in estados],
        )


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
