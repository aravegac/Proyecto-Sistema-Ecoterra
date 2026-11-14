# Aporte de Kryshsna Cerda a las predicciones

Esta carpeta reúne el código del aporte original de los modelos de tiempo de llegada y precio de Ecoterra. La estructura conserva las rutas del proyecto para localizar las partes en la rama compartida.

- Entrenamiento y preprocesamiento en `backend/predicciones/modelos.py` y `entrenar.py`.
- Datos simulados, métricas de evaluación y modelos entrenados en `datos/` y `artefactos/`.
- Carga portable del modelo en `portables.py`. Integración original con Django en `urls.py` y `views.py` y con React en `src/modules/IaPanel.tsx`.

Los archivos corresponden al estado del commit [542bbb1](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/542bbb1) y forman una selección del código. Para ejecutar el sistema completo se utiliza la rama compartida `development`.

## Historial del aporte

- [ee4d400](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/ee4d400) implementa el modelo de llegada.
- [fcf3c39](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/fcf3c39) implementa el modelo de precio.
- [fd08ffd](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/fd08ffd) integra ambos endpoints en Django.
- [1bbde78](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/1bbde78) conecta los formularios con la API.
- [d90e3d9](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/d90e3d9) valida las fechas y el año de embarque.
- [4e3829b](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/4e3829b) incorpora CLP y USD.
- [542bbb1](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/542bbb1) guarda los modelos entrenados en formato portable.
- [4de37fd](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/4de37fd) identifica Random Forest y ajusta el diseño de los formularios.
- [4b87ba4](https://github.com/aravegac/Proyecto-Sistema-Ecoterra/commit/4b87ba4) asigna permisos individuales a llegada y precio.

Los datos de entrenamiento de esta entrega son simulados. La rama compartida incorpora cambios posteriores, entre ellos el entrenamiento del precio con facturas reales.
