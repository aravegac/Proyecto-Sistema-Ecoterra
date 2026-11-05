
import itertools
import json
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

RUTA_COTIZACIONES = os.getenv(
    "RUTA_COTIZACIONES", "/api/cotizaciones/"
)
RUTA_ORDENES = os.getenv(
    "RUTA_ORDENES", "/api/ordenes-compra/"
)

COTIZACION_ID = os.getenv("COTIZACION_ID", "").strip()
ORDEN_COMPRA_ID = os.getenv("ORDEN_COMPRA_ID", "").strip()

OC_IDS = [
    x.strip()
    for x in os.getenv("OC_IDS", "").split(",")
    if x.strip()
]
COTIZACION_IDS = [
    x.strip()
    for x in os.getenv("COTIZACION_IDS", "").split(",")
    if x.strip()
]

# Configurar con la ruta real del endpoint de asociación.
# Puede usar {oc_id} y {cotizacion_id} como marcadores.
RUTA_ASOCIACION = os.getenv("RUTA_ASOCIACION", "")
METODO_ASOCIACION = os.getenv("METODO_ASOCIACION", "PATCH").upper()

CUERPO_ASOCIACION = os.getenv(
    "CUERPO_ASOCIACION",
    '{"id_cotizacion": "{cotizacion_id}"}'
)

CODIGOS_ASOCIACION_OK = {
    int(x.strip())
    for x in os.getenv(
        "CODIGOS_ASOCIACION_OK", "200,204"
    ).split(",")
    if x.strip()
}

# IDs distintos para cada usuario virtual de PR-06.
CONTADOR_USUARIOS = itertools.count()


def ruta_con_id(ruta, identificador):
    return f"{ruta.rstrip('/')}/{identificador}/"


def obtener_token(host, email, password):
    """
    Autentica al usuario sin contabilizar el login como
    solicitud de rendimiento en las estadísticas de Locust.
    """
    if not email or not password:
        raise RuntimeError(
            "Configura API_EMAIL y API_PASSWORD antes de ejecutar Locust."
        )

    url = f"{host.rstrip('/')}{LOGIN_PATH}"

    respuesta = requests.post(
        url,
        json={"email": email, "password": password},
        timeout=15,
    )
    respuesta.raise_for_status()

    datos = respuesta.json()
    token = datos.get("token")

    if not token:
        raise RuntimeError(
            "El login respondió, pero no se encontró el campo 'token'."
        )

    return token


class RendimientoSprint3(HttpUser):
    wait_time = between(0.5, 1.5)

    def on_start(self):
        try:
            token = obtener_token(self.host, EMAIL, PASSWORD)
        except Exception as error:
            print(f"[ERROR DE AUTENTICACIÓN] {error}")
            raise StopUser()

        self.headers = {"Authorization": f"Bearer {token}"}
        self.asociacion_realizada = False

        if PRUEBA == "PR-06":
            indice = next(CONTADOR_USUARIOS)

            if not RUTA_ASOCIACION:
                print(
                    "[ERROR DE CONFIGURACIÓN] "
                    "PR-06 requiere RUTA_ASOCIACION."
                )
                raise StopUser()

            if (
                indice >= len(OC_IDS)
                or indice >= len(COTIZACION_IDS)
            ):
                print(
                    "[ERROR DE CONFIGURACIÓN] "
                    "PR-06 necesita un par único de OC y cotización "
                    "para cada usuario virtual."
                )
                raise StopUser()

            self.oc_id = OC_IDS[indice]
            self.cotizacion_id = COTIZACION_IDS[indice]

    def consultar(self, nombre, ruta):
        with self.client.get(
            ruta,
            headers=self.headers,
            name=nombre,
            catch_response=True,
        ) as respuesta:
            if respuesta.status_code != 200:
                respuesta.failure(
                    f"HTTP {respuesta.status_code}: "
                    f"{respuesta.text[:200]}"
                )

    @task
    def ejecutar_escenario(self):
        if PRUEBA == "PR-01":
            self.consultar(
                "PR-01 Listado de cotizaciones",
                RUTA_COTIZACIONES,
            )

        elif PRUEBA == "PR-02":
            if not COTIZACION_ID:
                print("[CONFIG] Falta COTIZACION_ID.")
                raise StopUser()

            self.consultar(
                "PR-02 Detalle de cotización",
                ruta_con_id(RUTA_COTIZACIONES, COTIZACION_ID),
            )

        elif PRUEBA == "PR-03":
            self.consultar(
                "PR-03 Listado de órdenes de compra",
                RUTA_ORDENES,
            )

        elif PRUEBA == "PR-04":
            if not ORDEN_COMPRA_ID:
                print("[CONFIG] Falta ORDEN_COMPRA_ID.")
                raise StopUser()

            self.consultar(
                "PR-04 Detalle de orden de compra",
                ruta_con_id(RUTA_ORDENES, ORDEN_COMPRA_ID),
            )

        elif PRUEBA == "PR-05":
            # Cada usuario repite este conjunto de consultas
            # durante el tiempo configurado para Locust.
            self.consultar(
                "PR-05 Listado de cotizaciones",
                RUTA_COTIZACIONES,
            )
            self.consultar(
                "PR-05 Listado de órdenes de compra",
                RUTA_ORDENES,
            )

            if COTIZACION_ID:
                self.consultar(
                    "PR-05 Detalle de cotización",
                    ruta_con_id(RUTA_COTIZACIONES, COTIZACION_ID),
                )

            if ORDEN_COMPRA_ID:
                self.consultar(
                    "PR-05 Detalle de orden de compra",
                    ruta_con_id(RUTA_ORDENES, ORDEN_COMPRA_ID),
                )

        elif PRUEBA == "PR-06":
            # Solo una asociación por usuario virtual.
            if self.asociacion_realizada:
                raise StopUser()

            ruta = RUTA_ASOCIACION.format(
                oc_id=self.oc_id,
                cotizacion_id=self.cotizacion_id,
            )
            cuerpo = json.loads(
                CUERPO_ASOCIACION.format(
                    oc_id=self.oc_id,
                    cotizacion_id=self.cotizacion_id,
                )
            )

            metodo = getattr(
                self.client, METODO_ASOCIACION.lower(), None
            )
            if metodo is None:
                print(
                    "[CONFIG] Método de asociación no válido. "
                    "Usa POST, PATCH o PUT."
                )
                raise StopUser()

            with metodo(
                ruta,
                json=cuerpo,
                headers=self.headers,
                name="PR-06 Asociación OC-cotización",
                catch_response=True,
            ) as respuesta:
                if respuesta.status_code not in CODIGOS_ASOCIACION_OK:
                    respuesta.failure(
                        f"HTTP {respuesta.status_code}: "
                        f"{respuesta.text[:300]}"
                    )

            self.asociacion_realizada = True

        else:
            print(
                "[CONFIG] PRUEBA debe ser PR-01, PR-02, PR-03, "
                "PR-04, PR-05 o PR-06."
            )
            raise StopUser()
