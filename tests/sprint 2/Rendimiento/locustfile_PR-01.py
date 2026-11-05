
from locust import HttpUser, task, constant


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