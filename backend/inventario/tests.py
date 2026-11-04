from rest_framework import status
from rest_framework.test import APITestCase

from usuarios.models import Usuario

from .models import Inventario, Movimiento, Producto


class ProductoAltaTests(APITestCase):
    def test_crea_producto_sin_lotes_y_devuelve_stock_cero(self):
        self.client.force_authenticate(user=Usuario(id_rol=1, activo=True))

        response = self.client.post(
            "/api/productos/",
            {
                "codigo": "PROD-PRUEBA",
                "nombre": "Producto de prueba",
                "tipo": "Insumo",
                "unidad": "L",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["stock_disponible"], 0)
        self.assertEqual(response.data["stock_total"], 0)
        self.assertEqual(Producto.objects.get(codigo="PROD-PRUEBA").pk, response.data["id"])


class LoteTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(user=Usuario(id=1, id_rol=1, activo=True))
        self.producto = Producto.objects.create(
            codigo="LOTE-PRUEBA", nombre="Insumo", tipo="Insumo", unidad="L"
        )
        self.datos = {
            "id_producto": self.producto.pk,
            "cantidad": 100,
            "tipo_envase": "Tambor 200 L",
            "fecha_fabricacion": "2026-11-01",
            "fecha_vencimiento": "2027-11-01",
            "estado": "Disponible",
        }

    def test_rechaza_fechas_invertidas_y_cantidad_fuera_de_capacidad(self):
        for cambios, campo in [
            ({"fecha_vencimiento": "2026-10-31"}, "fecha_vencimiento"),
            ({"cantidad": 201}, "cantidad"),
            ({"tipo_envase": "IBC 1000 L", "cantidad": 1001}, "cantidad"),
        ]:
            with self.subTest(campo=campo, cambios=cambios):
                response = self.client.post("/api/inventario/", self.datos | cambios, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(campo, response.data)
        self.assertFalse(Inventario.objects.exists())

    def test_edita_ubicacion_y_rechaza_edicion_directa_de_stock(self):
        lote = Inventario.objects.create(**self.datos)
        url = f"/api/inventario/{lote.pk}/"
        response = self.client.patch(url, {"ubicacion": "Santiago"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.patch(url, {"cantidad": 150}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        lote.refresh_from_db()
        self.assertEqual(lote.ubicacion, "Santiago")
        self.assertEqual(lote.cantidad, 100)

    def test_movimiento_hasta_capacidad_y_rechazo_de_exceso(self):
        lote = Inventario.objects.create(**self.datos)
        datos = {"id_inventario": lote.pk, "id_usuario": 1}
        for tipo, cantidad in [("Entrada", 101), ("Ajuste", 201)]:
            with self.subTest(tipo=tipo):
                response = self.client.post(
                    "/api/movimientos/",
                    datos | {"tipo_movimiento": tipo, "cantidad_movimiento": cantidad},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                lote.refresh_from_db()
                self.assertEqual(lote.cantidad, 100)
                self.assertFalse(Movimiento.objects.exists())

        response = self.client.post(
            "/api/movimientos/",
            datos | {"tipo_movimiento": "Entrada", "cantidad_movimiento": 100},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        lote.refresh_from_db()
        self.assertEqual(lote.cantidad, 200)
        self.assertEqual(Movimiento.objects.get().stock_posterior, 200)
