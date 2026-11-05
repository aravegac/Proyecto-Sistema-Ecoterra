
import os

import requests
from locust import HttpUser, task, between
from locust.exception import StopUser


# =========================================================
# CONFIGURACIÓN
# =========================================================

PRUEBA = os.getenv("PRUEBA", "PR-01").upper()

LOGIN_PATH = "/api/auth/login/"

EMAIL = os.getenv("API_EMAIL", "")
PASSWORD = os.getenv("API_PASSWORD", "")

RUTA_NOTAS_CREDITO = os.getenv(
    "RUTA_NOTAS_CREDITO",
    "/api/notas-credito/"
)

RUTA_FACTURAS = os.getenv(
    "RUTA_FACTURAS",
    "/api/facturas/"
)


# =========================================================
# AUTENTICACIÓN
# =========================================================

def obtener_token(host, email, password):
    """
    Obtiene el token Bearer sin contabilizar el login
    como solicitud de rendimiento en Locust.
    """

    if not email or not password:
        raise RuntimeError(
            "Configura API_EMAIL y API_PASSWORD."
        )

    url = f"{host.rstrip('/')}{LOGIN_PATH}"

    respuesta = requests.post(
        url,
        json={
            "email": email,
            "password": password
        },
        timeout=15
    )

    respuesta.raise_for_status()

    datos = respuesta.json()
    token = datos.get("token")

    if not token:
        raise RuntimeError(
            "El login respondió, pero no se encontró el campo token."
        )

    return token


# =========================================================
# PRUEBAS DE RENDIMIENTO SPRINT 4
# =========================================================

class RendimientoSprint4(HttpUser):

    wait_time = between(1, 2)

    def on_start(self):

        try:
            token = obtener_token(
                self.host,
                EMAIL,
                PASSWORD
            )

        except Exception as error:
            print(f"[ERROR DE AUTENTICACIÓN] {error}")
            raise StopUser()

        self.headers = {
            "Authorization": f"Bearer {token}"
        }

    def consultar(self, nombre, ruta):

        with self.client.get(
            ruta,
            headers=self.headers,
            name=nombre,
            catch_response=True
        ) as respuesta:

            if respuesta.status_code != 200:
                respuesta.failure(
                    f"HTTP {respuesta.status_code}: "
                    f"{respuesta.text[:300]}"
                )
            else:
                respuesta.success()

    @task
    def ejecutar_escenario(self):

        if PRUEBA == "PR-01":

            self.consultar(
                "PR-01 Listado de notas de crédito",
                RUTA_NOTAS_CREDITO
            )

        elif PRUEBA == "PR-02":

            self.consultar(
                "PR-02 Listado de facturas",
                RUTA_FACTURAS
            )

        else:

            print(
                "[CONFIGURACIÓN] PRUEBA debe ser PR-01 o PR-02."
            )

            raise StopUser()
