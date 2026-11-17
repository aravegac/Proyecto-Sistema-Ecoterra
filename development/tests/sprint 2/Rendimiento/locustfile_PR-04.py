import os

from locust import HttpUser, task, constant


TEST_EMAIL = os.getenv("ECOTERRA_TEST_EMAIL")
TEST_PASSWORD = os.getenv("ECOTERRA_TEST_PASSWORD")

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
