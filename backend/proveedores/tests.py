from django.test import TestCase
from rest_framework.test import APIClient

from usuarios.models import Usuario
from .models import Proveedor


class ProveedorEstadoTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=Usuario.objects.create(
            nombre="Admin proveedores", email="prov@example.com", id_rol=1,
        ))
        self.payload = {"nombre_empresa": "Química Sur", "pais": "Chile", "contacto": "Ana",
                        "telefono": "+56 9 1234 5678", "email": "ventas@quimicasur.cl"}

    def test_estado_se_guarda_y_se_devuelve(self):
        response = self.api.post("/api/proveedores/", {**self.payload, "estado": "Inactivo"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["estado"], "Inactivo")
        proveedor = Proveedor.objects.get(pk=response.data["id"])
        self.assertFalse(proveedor.estado)

        response = self.api.patch(f"/api/proveedores/{proveedor.pk}/", {"estado": "Activo"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.api.get(f"/api/proveedores/{proveedor.pk}/").data["estado"], "Activo")

    def test_estado_por_defecto_activo_y_valores_invalidos(self):
        response = self.api.post("/api/proveedores/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["estado"], "Activo")
        response = self.api.post("/api/proveedores/", {**self.payload, "estado": "Pausado"}, format="json")
        self.assertEqual(response.status_code, 400)
