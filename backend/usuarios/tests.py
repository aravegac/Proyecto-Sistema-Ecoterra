from django.contrib.auth.hashers import make_password
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Usuario
from .permissions import permisos_efectivos, tiene_permiso


class UsuariosPermisosTests(TestCase):
    @classmethod
    def setUpClass(cls):
        with connection.cursor() as cursor:
            cursor.execute("CREATE TABLE permiso (id_permiso integer PRIMARY KEY, nombre_permiso text, modulo_permiso text, descripcion_permiso text, activo_permiso boolean)")
            cursor.execute("CREATE TABLE rol_permiso (id_rol integer, id_permiso integer, UNIQUE(id_rol, id_permiso))")
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        with connection.cursor() as cursor:
            cursor.execute("DROP TABLE rol_permiso")
            cursor.execute("DROP TABLE permiso")

    def setUp(self):
        self.api = APIClient()
        self.admin = Usuario.objects.create(nombre="Admin", email="admin@test.local", id_rol=1)
        self.user = Usuario.objects.create(nombre="Operador", email="operador@test.local", id_rol=2, contrasena=make_password("clave-prueba"))
        with connection.cursor() as cursor:
            for id_, name, active in [(1, "Consultar", True), (2, "Crear", True), (3, "Editar", True), (4, "Eliminar", False)]:
                cursor.execute("INSERT INTO permiso VALUES (%s, %s, 'clientes', '', %s)", [id_, name, active])
            cursor.execute("INSERT INTO rol_permiso VALUES (2, 1), (2, 2), (2, 4), (3, 1)")
        self.api.force_authenticate(user=self.admin)
        self.url = f"/api/usuarios/{self.user.pk}/permisos/"

    def test_carga_rol_y_permisos_efectivos_incluye_excepciones(self):
        self.user.permisos = {"clientes:Consultar": False, "clientes:Editar": True}
        self.user.save()
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id_rol"], 2)
        effective = response.data["permisos_efectivos"]
        self.assertFalse(effective["clientes:Consultar"])
        self.assertTrue(effective["clientes:Crear"])
        self.assertTrue(effective["clientes:Editar"])
        self.assertNotIn("clientes:Eliminar", effective)
        for action in ("Consultar", "Crear", "Editar"):
            self.assertEqual(tiene_permiso(self.user, "clientes", action), effective[f"clientes:{action}"])

    def test_guardar_casilla_desmarcada_y_rol_en_una_operacion(self):
        data = {"rol": "Usuario base", "permisos": {"clientes:Consultar": False, "clientes:Editar": True}}
        response = self.api.put(self.url, data, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.id_rol, 3)
        self.assertFalse(tiene_permiso(self.user, "clientes", "Consultar"))
        self.assertTrue(tiene_permiso(self.user, "clientes", "Editar"))
        self.assertEqual(self.api.get(self.url).data["permisos_efectivos"], response.data["permisos_efectivos"])
        response = self.api.patch(f"/api/usuarios/{self.user.pk}/", {"nombre": "Renombrado"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.permisos, data["permisos"])

    def test_login_utiliza_las_mismas_excepciones_que_la_api(self):
        self.api.put(self.url, {"permisos": {"clientes:Consultar": False, "clientes:Editar": True}}, format="json")
        self.api.force_authenticate(user=None)
        response = self.api.post("/api/auth/login/", {"email": self.user.email, "password": "clave-prueba"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(response.data["permisos"], permisos_efectivos(self.user))
        token = response.data["token"]
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.api.get("/api/clientes/").status_code, 403)

    def test_errores_no_guardan_cambios_parciales(self):
        for invalid in [{}, [], {"permisos": []}, {"rol": 3, "permisos": {"clientes:Crear": "false"}}, {"rol": 99, "permisos": {}}]:
            response = self.api.put(self.url, invalid, format="json")
            self.assertEqual(response.status_code, 400, response.data)
            self.user.refresh_from_db()
            self.assertEqual(self.user.id_rol, 2)
            self.assertEqual(self.user.permisos, {})

    def test_no_admin_no_puede_alterar_ni_leer_permisos_ajenos(self):
        self.api.force_authenticate(user=self.user)
        self.assertEqual(self.api.get(self.url).status_code, 403)
        self.assertEqual(self.api.put(self.url, {"permisos": {}}, format="json").status_code, 403)
        self.api.force_authenticate(user=None)
        self.assertEqual(self.api.get(self.url).status_code, 401)

    def test_serializador_no_permite_escalar_por_edicion_generica(self):
        self.user.permisos = {"usuarios_roles:Editar usuarios": True}
        self.user.save()
        self.api.force_authenticate(user=self.user)
        response = self.api.patch(f"/api/usuarios/{self.user.pk}/", {"permisos": {"clientes:Crear": True}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertNotIn("clientes:Crear", self.user.permisos)

    def test_admin_siempre_completo_y_roles_globales_validan_ids(self):
        response = self.api.get("/api/roles/1/permisos/")
        self.assertEqual([p["id"] for p in response.data["permisos"]], [1, 2, 3])
        self.assertEqual(self.api.put("/api/roles/1/permisos/", {"permisos": []}, format="json").status_code, 400)
        response = self.api.get(f"/api/usuarios/{self.admin.pk}/permisos/")
        self.assertTrue(all(response.data["permisos_efectivos"].values()))
        for invalid in [{}, {"permisos": "12"}, {"permisos": [True]}, {"permisos": [99]}, {"permisos": [4]}]:
            self.assertEqual(self.api.put("/api/roles/2/permisos/", invalid, format="json").status_code, 400)
        response = self.api.put("/api/roles/2/permisos/", {"permisos": [1, 3, 3]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([p["id"] for p in self.api.get("/api/roles/2/permisos/").data["permisos"]], [1, 3])
        self.assertEqual(self.api.get("/api/roles/99/permisos/").status_code, 404)

    def test_permisos_vacios_restauran_herencia(self):
        self.api.put(self.url, {"permisos": {"clientes:Consultar": False}}, format="json")
        response = self.api.put(self.url, {"permisos": {}}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["permisos_efectivos"]["clientes:Consultar"])
