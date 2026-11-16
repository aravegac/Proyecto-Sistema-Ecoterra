
import os
from datetime import date

from locust import HttpUser, task, between, tag
from locust.exception import StopUser


# ==========================================================
# CONFIGURACIÓN
# ==========================================================

EMAIL = os.getenv("LOCUST_EMAIL")
PASSWORD = os.getenv("LOCUST_PASSWORD")

# Debe corresponder a un producto activo incluido
# en el modelo de predicción de precios.
PRODUCTO_ID = os.getenv("LOCUST_PRODUCT_ID")

LOGIN_ENDPOINT = "/api/auth/login/"

# Datos válidos para la predicción de llegada.
DATOS_LLEGADA = {
    "puerto": "Miami, FL",
    "naviera": "MSC",
    "carga": "Exclusiva",
    "mes": date.today().month,
    "anio": date.today().year,
}

# Datos de precio. La fecha se establece dinámicamente.
DATOS_PRECIO = {
    "fecha": date.today().isoformat(),
    "cantidad": 10,
    "moneda": "CLP",
}


# ==========================================================
# USUARIO BASE: AUTENTICACIÓN
# ==========================================================

class UsuarioPredicciones(HttpUser):
    abstract = True

    wait_time = between(1, 2)

    def on_start(self):
        """
        Cada usuario simulado inicia sesión una vez.
        El token se reutiliza durante sus solicitudes.
        """

        if not EMAIL or not PASSWORD:
            print(
                "ERROR: Debes configurar LOCUST_EMAIL "
                "y LOCUST_PASSWORD."
            )
            raise StopUser()

        respuesta = self.client.post(
            LOGIN_ENDPOINT,
            json={
                "email": EMAIL,
                "password": PASSWORD,
            },
            name="Autenticación (no evaluar)",
        )

        if respuesta.status_code != 200:
            print(
                "ERROR de autenticación:",
                respuesta.status_code,
                respuesta.text,
            )
            raise StopUser()

        try:
            token = respuesta.json().get("token")
        except ValueError:
            token = None

        if not token:
            print(
                "ERROR: La respuesta del login no contiene "
                "un token válido."
            )
            raise StopUser()

        self.client.headers.update({
            "Authorization": f"Bearer {token}"
        })


# ==========================================================
# PR-01: PREDICCIÓN DE TIEMPO DE LLEGADA
# POST /api/predicciones/llegada/
# ==========================================================

class PruebaPrediccionLlegada(UsuarioPredicciones):

    @tag("llegada")
    @task
    def probar_prediccion_llegada(self):

        with self.client.post(
            "/api/predicciones/llegada/",
            json=DATOS_LLEGADA,
            name="PR-01 Predicción de llegada",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code != 200:
                respuesta.failure(
                    f"HTTP {respuesta.status_code}: "
                    f"{respuesta.text[:300]}"
                )
                return

            try:
                datos = respuesta.json()
            except ValueError:
                respuesta.failure(
                    "La respuesta no contiene JSON válido."
                )
                return

            # La API debe entregar una predicción.
            if not datos:
                respuesta.failure(
                    "La respuesta está vacía."
                )
                return

            respuesta.success()


# ==========================================================
# PR-02: PREDICCIÓN DE PRECIO
# POST /api/predicciones/precio/
# ==========================================================

class PruebaPrediccionPrecio(UsuarioPredicciones):

    def on_start(self):
        super().on_start()

        if not PRODUCTO_ID:
            print(
                "ERROR: Debes configurar LOCUST_PRODUCT_ID "
                "con un producto válido para el modelo de precio."
            )
            raise StopUser()

        try:
            producto_id = int(PRODUCTO_ID)
            if producto_id < 1:
                raise ValueError()
        except ValueError:
            print("ERROR: LOCUST_PRODUCT_ID debe ser un entero positivo.")
            raise StopUser()

        self.datos_precio = {
            **DATOS_PRECIO,
            "producto": producto_id,
        }

    @tag("precio")
    @task
    def probar_prediccion_precio(self):

        with self.client.post(
            "/api/predicciones/precio/",
            json=self.datos_precio,
            name="PR-02 Predicción de precio",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code != 200:
                respuesta.failure(
                    f"HTTP {respuesta.status_code}: "
                    f"{respuesta.text[:300]}"
                )
                return

            try:
                datos = respuesta.json()
            except ValueError:
                respuesta.failure(
                    "La respuesta no contiene JSON válido."
                )
                return

            if not datos:
                respuesta.failure(
                    "La respuesta está vacía."
                )
                return

            respuesta.success()


# ==========================================================
# PR-03: PREDICCIÓN DE REPOSICIÓN DE STOCK
# GET /api/predicciones/stock/
# ==========================================================

class PruebaPrediccionStock(UsuarioPredicciones):

    @tag("stock")
    @task
    def probar_prediccion_stock(self):

        with self.client.get(
            "/api/predicciones/stock/",
            name="PR-03 Predicción de stock",
            catch_response=True,
        ) as respuesta:

            if respuesta.status_code != 200:
                respuesta.failure(
                    f"HTTP {respuesta.status_code}: "
                    f"{respuesta.text[:300]}"
                )
                return

            try:
                datos = respuesta.json()
            except ValueError:
                respuesta.failure(
                    "La respuesta no contiene JSON válido."
                )
                return

            if datos.get("exito") is not True:
                respuesta.failure(
                    "La API no confirmó la ejecución exitosa."
                )
                return

            if not isinstance(datos.get("resultados"), list):
                respuesta.failure(
                    "La respuesta no contiene una lista de resultados."
                )
                return

            respuesta.success()
