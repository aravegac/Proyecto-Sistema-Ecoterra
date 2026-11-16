<div align="center">

<img src="src/imports/logo_ecoterra.png" alt="EcoTerra Logo" width="320" />

# 🌍 EcoTerra — Sistema de Gestión Operativa, Facturación e Inteligencia Artificial

![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS_4-38BDF8?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Django REST](https://img.shields.io/badge/Backend-Django_5.2_+_DRF-092E20?style=for-the-badge&logo=django&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_(Supabase)-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Scikit-Learn](https://img.shields.io/badge/AI/ML-Scikit--Learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)
![Docker](https://img.shields.io/badge/Deploy-Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)

<p align="center">
  <b>Sistema integral para la centralización de clientes, inventario, cotizaciones, facturación y análisis predictivo en el control de polvo y estabilización de caminos.</b>
</p>

[📌 Descripción](#-descripción-general) •
[✨ Módulos](#-módulos-y-funcionalidades) •
[🤖 IA](#-modelos-de-inteligencia-artificial) •
[🏗️ Arquitectura](#️-arquitectura-del-sistema) •
[🚀 Instalación](#-instalación-y-configuración) •
[🧪 Pruebas](#-ejecución-de-pruebas) •
[🛟 Problemas](#-solución-de-problemas)

---

</div>

## 📌 Descripción General

**EcoTerra** es una empresa especializada en soluciones con polímeros para el control de polvo y la estabilización de caminos en áreas industriales y mineras. Parte de sus productos son adquiridos en Estados Unidos y trasladados a Chile vía transporte marítimo.

Este proyecto corresponde a un **Sistema de Gestión de Inventario, Cotizaciones, Facturación y Predicciones con IA**, diseñado para centralizar la operación logística y comercial, permitiendo una toma de decisiones informada basada en modelos analíticos.

> **Proyecto APT — Capstone**, Ingeniería en Informática. Este README es la versión breve del [manual técnico](docs/06_despliegue/manual_tecnico.pdf).

---

## ✨ Módulos y Funcionalidades

### 📦 1. Gestión Operativa e Inventario
* **Clientes y Direcciones:** Registro de clientes y soporte para múltiples direcciones de despacho.
* **Productos y Lotes:** Control de características, envases, ubicación y fechas de fabricación/vencimiento.
* **Control de Inventario:** Existencias en tiempo real y movimientos de entrada, salida y ajuste.
* **Gestión de Proveedores:** Operaciones CRUD.
* **Usuarios y Seguridad:** Autenticación con token Bearer (8 h) y control de acceso por roles y permisos.

### 📄 2. Cotizaciones y Facturación
* **Ciclo Comercial:** Cotizaciones, vinculación con Órdenes de Compra (con detección automática desde PDF) y generación de facturas.
* **Documentos:** Facturas detalladas y notas de crédito asociadas.
* **PDF seguros:** Documentos comerciales generados con ReportLab y almacenados en Supabase Storage.
* **Notificaciones:** Envío de cotizaciones y facturas por correo electrónico.

### 🧠 3. Módulo de Inteligencia Artificial
* Modelos predictivos de apoyo a la gestión comercial y a la reposición de stock, expuestos como endpoints de la API.

---

## 🤖 Modelos de Inteligencia Artificial

Desarrollados en **Python** con **scikit-learn**, **pandas** y **joblib** (`backend/predicciones/`):

| Modelo | Entradas (Features) | Salida (Target) | Endpoint |
| :--- | :--- | :--- | :--- |
| **⏱️ Tiempo de Llegada** | Puerto de origen, Naviera, Tipo de carga, Mes | Días estimados de arribo | `/api/predicciones/llegada/` |
| **💰 Predicción de Precio** | Producto, Fecha, Cantidad | Precio esperado (CLP/USD) | `/api/predicciones/precio/` |
| **📊 Reposición de Stock** | Stock actual, Ventas promedio, Stock mínimo | Días antes del desabastecimiento | `/api/predicciones/stock/` |

---

## 🏗️ Arquitectura del Sistema

Aplicación web cliente-servidor por capas. El frontend (SPA en React) consume una API REST en Django REST Framework, que persiste los datos en PostgreSQL (Supabase) y guarda los PDF en Supabase Storage. El módulo de IA se ejecuta dentro del backend.

```mermaid
graph TD
    A[Navegador] -->|HTTP| B[Frontend: React 19 + Vite 8 · :5173]
    B -->|Proxy /api · token Bearer| C[Backend: Django 5.2 + DRF · :8444]
    C -->|SSL :5432| D[(PostgreSQL en Supabase)]
    C -->|HTTPS| S[Supabase Storage: PDF]
    C --> E[Módulo IA: scikit-learn / joblib]
    E --> F1[Predicción Tiempo Llegada]
    E --> F2[Predicción Precio]
    E --> F3[Predicción Reposición Stock]
```

| Componente | Tecnología | Ubicación |
| :--- | :--- | :--- |
| Frontend | React 19, TypeScript 5.7, Vite 8, Tailwind CSS 4 | `src/`, `Dockerfile` |
| Backend / API | Python, Django 5.2, DRF 3.16, django-cors-headers | `backend/` (usuarios, clientes, inventario, proveedores, cotizaciones, facturacion, ventas, predicciones) |
| Base de datos | PostgreSQL en Supabase (psycopg 3); SQLite solo en pruebas | `backend/config/settings.py`, `scripts/*.sql` |
| Documentos | ReportLab (generación) y pypdf (lectura de OC) | `backend/cotizaciones/pdf.py`, `backend/ventas/deteccion_oc.py` |
| IA | scikit-learn, pandas, joblib | `backend/predicciones/` |
| Contenedores | Docker + Docker Compose | `docker-compose.yml`, `Dockerfile`, `backend/Dockerfile` |

---

## 🚀 Instalación y Configuración

### Requisitos

| Herramienta | Versión | Uso |
| :--- | :--- | :--- |
| Docker Desktop / Engine | 29.x | Vía recomendada |
| Docker Compose | v5 (plugin `docker compose`) | Orquestar backend y frontend |
| Git | 2.x | Clonar el repositorio |
| *Sin Docker (opcional)* | Python ≥ 3.12, Node.js 20/22, pnpm 10 | Versiones fijadas en `.mise.toml` |

- **Recursos:** 4 GB de RAM libres y 3 GB de disco.
- **Puertos libres:** `5173` (frontend) y `8444` (API y `/admin/`).
- **Red:** acceso a Internet hacia Supabase (PostgreSQL :5432 con SSL y Storage por HTTPS).
- **Credenciales:** cadena de conexión y claves de Supabase, entregadas por el líder técnico por canal privado.

### 1. Clonar y configurar variables

```bash
git clone https://github.com/aravegac/Proyecto-Sistema-Ecoterra.git
cd Proyecto-Sistema-Ecoterra
cp .env.local.example .env.local      # PowerShell: Copy-Item .env.local.example .env.local
```

Completa `.env.local` y crea `backend/.env` con las mismas variables (Docker Compose inyecta `.env.local`; Django lee `backend/.env` fuera de Docker):

```ini
DJANGO_SECRET_KEY=          # obligatoria: sin ella Django no inicia
DEBUG=True                  # True solo en desarrollo; False en producción
DATABASE_URL=               # postgresql://usuario:clave@host:5432/postgres?sslmode=require
SUPABASE_URL=               # URL del proyecto Supabase
SUPABASE_PUBLISHABLE_KEY=   # clave pública
SUPABASE_SECRET_KEY=        # clave de servicio (solo backend)
SUPABASE_STORAGE_BUCKET=    # bucket donde se guardan los PDF
# DJANGO_ALLOWED_HOSTS=api.midominio.cl              (opcional)
# DJANGO_CORS_ALLOWED_ORIGINS=https://app.midominio.cl (opcional)
```

> 🔒 Los archivos `.env*` están en `.gitignore`; solo se versionan los `*.example`. Nunca subas claves al repositorio.
> Si `DATABASE_URL` no está definida, el backend usa SQLite (`backend/db.sqlite3`) como respaldo. También se aceptan `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` y `DB_PORT`.

### 2. Levantar con Docker (recomendado)

```bash
docker compose up --build        # construir e iniciar (primer arranque o tras cambiar dependencias)
docker compose up -d             # iniciar en segundo plano
docker compose logs -f backend   # ver registros de la API
docker compose down              # detener y eliminar los contenedores
```

El frontend recibe `VITE_API_TARGET=http://backend:8444`, así Vite reenvía `/api` al backend. El código se monta como volumen, por lo que los cambios se recargan sin reconstruir.

### 3. Base de datos y modelos de IA

> ⚠️ **No ejecutes `migrate` ni `makemigrations` contra Supabase.** El esquema ya existe y los modelos usan `managed = False` (solo se gestionan en pruebas). Los cambios de esquema se aplican con `scripts/*.sql`.

```bash
# Superusuario de Django (opcional)
docker compose exec backend python manage.py createsuperuser

# Entrenar modelos de llegada y precio (modelos.joblib no se versiona)
docker compose exec backend python predicciones/entrenar.py
```

Esto genera `backend/predicciones/artefactos/modelos.joblib` y `metricas.json`. El modelo de stock ya viene entrenado en `backend/predicciones/ml/modelos/modelo_stock.pkl`.

### 4. Sin Docker (desarrollo local)

```powershell
pnpm install                                         # dependencias del frontend
py -m venv .venv ; .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt            # dependencias del backend
$env:VITE_API_TARGET="http://127.0.0.1:8444"         # proxy de Vite hacia la API
pnpm dev                                             # backend (:8444) y frontend (:5173) juntos
```

`pnpm dev` usa `concurrently` para iniciar ambos procesos en una sola terminal; se detiene con `Ctrl+C`.
Si PowerShell bloquea la activación del entorno virtual: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 5. Acceso y verificación

| Recurso | URL | Resultado esperado |
| :--- | :--- | :--- |
| Aplicación web | http://localhost:5173 | Pantalla de inicio de sesión |
| Login (API) | `POST http://localhost:8444/api/auth/login/` | 200 con token Bearer (8 h), rol y permisos; 401 si falla |
| Endpoint protegido | `GET http://localhost:8444/api/clientes/` | 401 sin token; 200 con `Authorization: Bearer <token>` |
| Admin Django | http://localhost:8444/admin/ | Login del superusuario |

```bash
curl -X POST http://localhost:8444/api/auth/login/ -H "Content-Type: application/json" \
     -d '{"email":"<correo>","password":"<clave>"}'
```

**Endpoints principales** (prefijo `/api/`): `auth/login/`, `usuarios/`, `permisos/`, `roles/<id>/permisos/`, `clientes/`, `productos/`, `inventario/`, `movimientos/`, `proveedores/`, `cotizaciones/`, `detalle-cotizacion/`, `ordenes-compra/`, `facturas/`, `notas-credito/`, `predicciones/llegada/`, `predicciones/precio/`, `predicciones/stock/`.

**Usuarios:** se guardan en la tabla `usuario` de Supabase con contraseña en hash. El rol 1 (Administrador) tiene todos los permisos; los demás se controlan con `rol_permiso` y excepciones por usuario. Las credenciales de prueba se entregan por canal privado.

---

## 🧪 Ejecución de Pruebas

Las pruebas usan SQLite (`backend/test.sqlite3`) cuando el comando contiene `test`, por lo que **nunca modifican Supabase**.

| Tipo | Comando | Alcance |
| :--- | :--- | :--- |
| Unitarias e integración | `docker compose exec backend python manage.py test` | ≈ 230 casos en todos los módulos |
| Por módulo | `python manage.py test cotizaciones` (o `ventas`, `facturacion`…) | Módulo indicado |
| Módulo IA | `python manage.py test predicciones.tests` | Llegada, precio y reposición de stock |
| Rendimiento (Locust) | `locust -f backend/locustfile_PR_SPRINT3.py --host http://localhost:8444` | Requiere `pip install locust`, `API_EMAIL` y `API_PASSWORD` |
| Compilación frontend | `pnpm build` | SPA compila sin errores de TypeScript/Vite |

Otros escenarios de rendimiento: `tests/sprint 2/Rendimiento` y `tests/sprint-4/rendimiento`. PDF de órdenes de compra de ejemplo: `tests/datos_prueba/ordenes_compra/`.

---

## 🛟 Solución de Problemas

| Problema | Causa probable | Solución |
| :--- | :--- | :--- |
| `ImproperlyConfigured ... DJANGO_SECRET_KEY` | Falta la clave secreta | Agregarla en `.env.local` / `backend/.env` y `docker compose up --build` |
| `port is already allocated` | Otro proceso usa 5173 u 8444 | Cerrarlo (`netstat -ano \| findstr :8444`) o cambiar el puerto en `docker-compose.yml` |
| La API no conecta a la BD (timeout, SSL) | `DATABASE_URL` incorrecta, sin `sslmode=require` o sin Internet | Revisar la cadena en Supabase (Project Settings > Database) |
| Login falla con error de red | El proxy `/api` apunta a otro puerto (por defecto :8000) | Definir `VITE_API_TARGET` a `:8444` (local) o `http://backend:8444` (Docker) |
| `400 Bad Request` / `DisallowedHost` | Host no permitido | Añadirlo en `DJANGO_ALLOWED_HOSTS` |
| Bloqueo CORS | Origen no permitido | Añadirlo en `DJANGO_CORS_ALLOWED_ORIGINS` |
| Error de modelo en llegada/precio | No existe `artefactos/modelos.joblib` | `python predicciones/entrenar.py` |
| `401 El token ha expirado` | El token dura 8 horas | Volver a iniciar sesión |
| Cambios no se reflejan | Imagen o caché antigua | `docker compose down` y `docker compose up --build` |

---

## 📁 Estructura del Repositorio

```text
Proyecto-Sistema-Ecoterra/
├── README.md · docker-compose.yml · Dockerfile (frontend) · .env.local.example
├── src/                  frontend React (App.tsx, api.ts, session.ts, modules/, layout/)
├── backend/              API Django (config/, usuarios/, clientes/, inventario/, proveedores/,
│                         cotizaciones/, facturacion/, ventas/, predicciones/,
│                         Dockerfile, requirements.txt)
├── scripts/              scripts SQL de cambios de esquema en Supabase
├── tests/                datos de prueba y pruebas de rendimiento por sprint
```
