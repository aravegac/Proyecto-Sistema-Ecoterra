from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Cliente, Direccion
from usuarios.models import Usuario
from usuarios.authentication import crear_token
from config.test_support import SalesTablesMixin


class ClienteModelTests(SalesTablesMixin, TestCase):
    # Crea un cliente de pruebas autenticado con el token de un usuario administrador.
    def authenticated_api(self):
        user, _ = Usuario.objects.get_or_create(
            email="cliente-tests@example.com",
            defaults={"nombre": "Admin de pruebas", "id_rol": 1, "activo": True},
        )
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {crear_token(user)}")
        return api

    # Comprueba que un cliente puede guardar varias direcciones.
    def test_cliente_puede_tener_varias_direcciones(self):
        cliente = Cliente.objects.create(
            rut="76.123.456-7",
            razon_social="EcoTerra SpA",
            ciudad="Santiago",
            telefono="+56 9 1111 1111",
            email="ecoterra@example.com",
        )
        Direccion.objects.create(
            cliente=cliente,
            nombre="Bodega principal",
            calle="Av. Principal 100",
            ciudad="Santiago",
            region="Metropolitana",
            pais="Chile",
            tipo=Direccion.Tipo.DESPACHO,
            contacto_recepcion="Ana Pérez",
            telefono_contacto="+56 9 2222 2222",
            principal=True,
        )
        Direccion.objects.create(
            cliente=cliente,
            nombre="Oficina administrativa",
            calle="Calle Oficina 200",
            ciudad="Santiago",
            region="Metropolitana",
            pais="Chile",
            tipo=Direccion.Tipo.FACTURACION,
            contacto_recepcion="Luis Soto",
            telefono_contacto="+56 9 3333 3333",
        )

        self.assertEqual(cliente.direcciones.count(), 2)
        self.assertEqual(cliente.direcciones.first().nombre, "Bodega principal")

    # Comprueba que el modelo permite persistir dos direcciones principales para el mismo cliente sin pasar por el serializer.
    def test_unica_direccion_principal_por_cliente(self):
        cliente = Cliente.objects.create(
            rut="76.987.654-5",
            razon_social="Mina Norte Ltda.",
            ciudad="Antofagasta",
            telefono="+56 9 4444 4444",
            email="mina@example.com",
        )

        Direccion.objects.create(
            cliente=cliente,
            nombre="Patio principal",
            calle="Ruta Minera 10",
            ciudad="Antofagasta",
            region="Antofagasta",
            pais="Chile",
            tipo=Direccion.Tipo.DESPACHO,
            contacto_recepcion="Pedro Soto",
            telefono_contacto="+56 9 5555 5555",
            principal=True,
        )

        Direccion.objects.create(
            cliente=cliente,
            nombre="Sucursal secundaria",
            calle="Ruta Minera 20",
            ciudad="Antofagasta",
            region="Antofagasta",
            pais="Chile",
            tipo=Direccion.Tipo.OTRO,
            contacto_recepcion="María Soto",
            telefono_contacto="+56 9 6666 6666",
            principal=True,
        )
        self.assertEqual(cliente.direcciones.filter(principal=True).count(), 2)

    # Comprueba que la API devuelve clientes con sus direcciones.
    def test_endpoint_api_devuelve_clientes(self):
        cliente = Cliente.objects.create(
            rut="77.123.456-1",
            razon_social="EcoTerra Operaciones",
            ciudad="Valparaíso",
            telefono="+56 9 1234 5678",
            email="contacto@ecoterra.cl",
            representante="María Pérez",
        )
        Direccion.objects.create(
            cliente=cliente,
            nombre="Oficina central",
            calle="Av. Central 300",
            ciudad="Valparaíso",
            region="Valparaíso",
            pais="Chile",
            tipo=Direccion.Tipo.DESPACHO,
            contacto_recepcion="María Pérez",
            telefono_contacto="+56 9 7777 7777",
            principal=True,
        )

        response = self.authenticated_api().get("/api/clientes/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["rut"], "77.123.456-1")
        self.assertEqual(response.data[0]["direcciones"][0]["nombre"], "Oficina central")

    # Comprueba que la API crea y elimina un cliente.
    def test_endpoint_api_crea_y_elimina_cliente(self):
        api = self.authenticated_api()

        create_response = api.post(
            "/api/clientes/",
            {
                "rut": "78.456.123-2",
                "razon_social": "Minería Sur SA",
                "nombre_fantasia": "Minería Sur",
                "ciudad": "Temuco",
                "telefono": "+56 9 2222 3333",
                "email": "contacto@mineriasur.cl",
                "representante": "Luis Vega",
                "estado": "Activo",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        cliente_id = create_response.data["id"]
        self.assertEqual(create_response.data["razon_social"], "Minería Sur SA")

        delete_response = api.delete(f"/api/clientes/{cliente_id}/")

        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Cliente.objects.filter(id=cliente_id).exists())

    # Comprueba que la API acepta y normaliza un RUT válido.
    def test_endpoint_api_normaliza_y_acepta_rut_valido(self):
        response = self.authenticated_api().post(
            "/api/clientes/",
            {
                "rut": "11.111.111-1",
                "razon_social": "Cliente con RUT válido",
                "ciudad": "Santiago",
                "telefono": "+56 9 1212 1212",
                "email": "rut-valido@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["rut"], "11111111-1")

    # Comprueba que la API rechaza un RUT con dígito verificador incorrecto.
    def test_endpoint_api_rechaza_rut_invalido(self):
        response = self.authenticated_api().post(
            "/api/clientes/",
            {
                "rut": "11.111.111-2",
                "razon_social": "Cliente con RUT inválido",
                "ciudad": "Santiago",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["rut"][0], "Ingresa un RUT chileno válido.")

    # Comprueba que la API rechaza correos inválidos.
    def test_endpoint_api_rechaza_correo_invalido(self):
        response = self.authenticated_api().post(
            "/api/clientes/",
            {
                "rut": "11.111.111-1",
                "razon_social": "Cliente con correo inválido",
                "ciudad": "Santiago",
                "email": "correo-invalido",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    # Comprueba que la API persiste los cambios del cliente.
    def test_endpoint_api_actualiza_cliente(self):
        cliente = Cliente.objects.create(
            rut="79.123.456-8",
            razon_social="Cliente Original",
            ciudad="Santiago",
        )

        response = self.authenticated_api().patch(
            f"/api/clientes/{cliente.id}/",
            {
                "razon_social": "Cliente Actualizado",
                "ciudad": "Concepción",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["razon_social"], "Cliente Actualizado")
        self.assertEqual(response.data["ciudad"], "Concepción")
        cliente.refresh_from_db()
        self.assertEqual(cliente.razon_social, "Cliente Actualizado")
        self.assertEqual(cliente.ciudad, "Concepción")

    # Comprueba que la API crea, modifica y elimina direcciones del cliente.
    def test_endpoint_api_gestiona_direcciones_de_cliente(self):
        api = self.authenticated_api()
        cliente = Cliente.objects.create(
            rut="79.654.321-0",
            razon_social="Cliente con Direcciones",
            ciudad="Santiago",
        )

        create_response = api.post(
            f"/api/clientes/{cliente.id}/direcciones/",
            {
                "nombre": "Bodega central",
                "calle": "Av. Bodega 10",
                "ciudad": "Santiago",
                "region": "Metropolitana",
                "pais": "Chile",
                "tipo": "Despacho",
                "contacto_recepcion": "Ana Pérez",
                "telefono_contacto": "+56 9 8888 8888",
                "principal": True,
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        address_id = create_response.data["id"]
        self.assertEqual(create_response.data["nombre"], "Bodega central")

        update_response = api.patch(
            f"/api/clientes/{cliente.id}/direcciones/{address_id}/",
            {"nombre": "Bodega actualizada"},
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["nombre"], "Bodega actualizada")

        list_response = api.get(f"/api/clientes/{cliente.id}/direcciones/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)

        delete_response = api.delete(
            f"/api/clientes/{cliente.id}/direcciones/{address_id}/",
        )
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Direccion.objects.filter(id=address_id).exists())

    # Comprueba que la API explica por qué rechaza otra dirección principal.
    def test_endpoint_api_explica_direccion_principal_duplicada(self):
        api = self.authenticated_api()
        cliente = Cliente.objects.create(
            rut="79.765.432-1",
            razon_social="Cliente Principal",
            ciudad="Santiago",
            telefono="+56 9 9999 9999",
            email="principal@example.com",
        )
        Direccion.objects.create(
            cliente=cliente,
            nombre="Bodega existente",
            calle="Av. Existente 10",
            ciudad="Santiago",
            region="Metropolitana",
            pais="Chile",
            tipo=Direccion.Tipo.DESPACHO,
            contacto_recepcion="Ana Pérez",
            telefono_contacto="+56 9 1010 1010",
            principal=True,
        )

        response = api.post(
            f"/api/clientes/{cliente.id}/direcciones/",
            {
                "nombre": "Otra bodega",
                "calle": "Av. Otra 20",
                "ciudad": "Santiago",
                "region": "Metropolitana",
                "pais": "Chile",
                "tipo": "Despacho",
                "contacto_recepcion": "Luis Soto",
                "telefono_contacto": "+56 9 1111 2222",
                "principal": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["principal"][0],
            "Este cliente ya tiene una dirección principal.",
        )
