from locust import HttpUser, task, constant


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
