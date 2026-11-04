from rest_framework import status
from rest_framework.test import APITestCase

from usuarios.models import Usuario

from .models import Producto


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
