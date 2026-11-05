from locust import HttpUser, task, constant


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
