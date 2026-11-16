from locust import HttpUser, task, constant


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
