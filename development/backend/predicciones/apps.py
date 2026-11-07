import sys
import threading

from django.apps import AppConfig


# Comandos que no atienden peticiones: no vale la pena cargar el modelo.
COMANDOS_SIN_PRECARGA = {
    "makemigrations", "migrate", "shell", "test", "collectstatic",
    "createsuperuser", "check", "showmigrations", "dbshell",
}


def _precargar_modelo_stock():
    try:
        from predicciones.ml.predecir_stock import cargar_modelo, cargar_rangos

        cargar_modelo()
        cargar_rangos()
    except Exception:
        # Si falla, se volverá a intentar en la primera petición.
        pass


class PrediccionesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'predicciones'

    def ready(self):
        # El modelo de stock tarda varios segundos en cargarse.
        # Se carga en segundo plano al iniciar el servidor para
        # que la primera consulta del usuario no tenga que esperar.
        if len(sys.argv) > 1 and sys.argv[1] in COMANDOS_SIN_PRECARGA:
            return

        threading.Thread(
            target=_precargar_modelo_stock,
            name="precarga-modelo-stock",
            daemon=True,
        ).start()
