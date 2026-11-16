import os
from locust import HttpUser, task, constant

# Variables utilizadas para PR-04
TEST_EMAIL = os.getenv("ECOTERRA_TEST_EMAIL")
TEST_PASSWORD = os.getenv("ECOTERRA_TEST_PASSWORD")

#PR-01
class UsuarioEcoterra(HttpUser):
    # Tiempo de espera entre solicitudes de cada usuario
    wait_time = constant(1)

    @task
    def consultar_clientes(self):
        with self.client.get(
            "/api/clientes/",
            name="PR-01 - Consultar clientes",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code == 200:
                respuesta.success()
            else:
                respuesta.failure(
                    f"Se esperaba HTTP 200; "
                    f"se obtuvo HTTP {respuesta.status_code}"
                )

# PR-02
class RendimientoProductos(HttpUser):
    # Tiempo de espera entre solicitudes de cada usuario
    wait_time = constant(1)

    @task
    def consultar_productos(self):
        with self.client.get(
            "/api/productos/",
            name="PR-02 - Consultar productos",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code == 200:
                respuesta.success()
            else:
                respuesta.failure(
                    f"Se esperaba HTTP 200; "
                    f"se obtuvo HTTP {respuesta.status_code}"
                )

# PR-03
class RendimientoEcoterra(HttpUser):
    # Tiempo de espera entre solicitudes de cada usuario
    wait_time = constant(1)

    @task
    def consultar_proveedores(self):
        with self.consultar_endpoint(
            "/api/proveedores/",
            name="PR-03 - Consultar proveedores",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code == 200:
                respuesta.success()
            else:
                respuesta.failure(
                    f"Se esperaba HTTP 200; "
                    f"se obtuvo HTTP {respuesta.status_code}"
                )


# PR-04
if not TEST_EMAIL or not TEST_PASSWORD:
    raise RuntimeError(
        "Define ECOTERRA_TEST_EMAIL y ECOTERRA_TEST_PASSWORD "
        "con las credenciales de un usuario de pruebas."
    )


class RendimientoLoginEcoterra(HttpUser):
    wait_time = constant(1)

    @task
    def iniciar_sesion(self):
        with self.client.post(
            "/api/auth/login/",
            json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
            },
            name="PR-04 - Inicio de sesión",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code != 200:
                respuesta.failure(
                    f"Se esperaba HTTP 200; "
                    f"se obtuvo HTTP {respuesta.status_code}"
                )
                return

            try:
                datos = respuesta.json()
            except ValueError:
                respuesta.failure("La respuesta no contiene JSON válido.")
                return

            campos_esperados = {
                "id",
                "nombre",
                "email",
                "rol",
                "estado",
            }

            if not campos_esperados.issubset(datos.keys()):
                respuesta.failure(
                    "La respuesta no contiene todos los campos esperados."
                )
            elif datos.get("estado") != "Activo":
                respuesta.failure(
                    "El usuario autenticado no figura como activo."
                )
            else:
                respuesta.success()

# PR-05
class RendimientoInventario(HttpUser):
    # Mantiene una pausa de 1 segundo entre tareas de cada usuario.
    wait_time = constant(1)

    @task
    def consultar_inventario(self):
        with self.client.get(
            "/api/inventario/",
            name="PR-05 - Consultar inventario",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code == 200:
                respuesta.success()
            else:
                respuesta.failure(
                    f"Se esperaba HTTP 200; "
                    f"se obtuvo HTTP {respuesta.status_code}"
                )

# PR-06
class RendimientoMovimientos(HttpUser):
    # Mantiene una pausa de 1 segundo entre tareas de cada usuario.
    wait_time = constant(1)

    @task
    def consultar_movimientos(self):
        with self.client.get(
            "/api/movimientos/",
            name="PR-06 - Consultar movimientos de inventario",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code == 200:
                respuesta.success()
            else:
                respuesta.failure(
                    f"Se esperaba HTTP 200; "
                    f"se obtuvo HTTP {respuesta.status_code}"
                )