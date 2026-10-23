<div align="center">

<img src="src/imports/logo_ecoterra.png" alt="EcoTerra Logo" width="320" />

# 🌍 EcoTerra — Sistema de Gestión Operativa, Facturación e Inteligencia Artificial

[![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)]
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38BDF8?style=for-the-badge&logo=tailwind-css&logoColor=white)]
[![Django REST](https://img.shields.io/badge/Backend-Django_REST_Framework-092E20?style=for-the-badge&logo=django&logoColor=white)]
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)]
[![Scikit-Learn](https://img.shields.io/badge/AI/ML-Scikit--Learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)]
[![Python](https://img.shields.io/badge/Language-Python_3.x-3776AB?style=for-the-badge&logo=python&logoColor=white)]

<p align="center">
  <b>Sistema integral para la centralización de clientes, inventario, cotizaciones, facturación y análisis predictivo en el control de polvo y estabilización de caminos.</b>
</p>

[📌 Descripción General](#-descripción-general) •
[✨ Módulos y Funcionalidades](#-módulos-y-funcionalidades) •
[🤖 Modelos de Inteligencia Artificial](#-modelos-de-inteligencia-artificial) •
[🏗️ Arquitectura](#️-arquitectura-del-sistema) •
[🛠️ Stack Tecnológico](#️-stack-tecnológico) •
[🚀 Instalación y Despliegue](#-instalación-y-configuración) •
[👥 Equipo](#-equipo-de-desarrollo)

---

</div>

## Instalación y configuración

### Requisitos previos

- Python 3.12 o superior
- Node.js 20 o superior
- `pnpm`

### 1. Instalar dependencias del frontend

Desde la raíz del proyecto:

```powershell
pnpm install
```

Si `pnpm` no está instalado:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

### 2. Crear el entorno virtual del backend

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Si PowerShell bloquea la activación del entorno virtual, ejecutar una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Después, repetir:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Configurar la base de datos existente

Completa `DATABASE_URL` en `.env.local` con la cadena de conexión de Supabase.
Las tablas ya existen en Supabase; por eso **no ejecutes `migrate` ni `makemigrations` contra esa base**.
El proyecto usa los modelos con `managed = False` fuera del entorno de pruebas para evitar cambios de esquema.

Para crear un usuario administrador de Django:

```powershell
py backend\manage.py createsuperuser
```

### 4. Ejecutar frontend y backend juntos

Desde la raíz del proyecto, con el entorno virtual activo:

```powershell
pnpm dev
```

La aplicación se abrirá en el puerto que muestre Vite, normalmente:

```text
http://localhost:8443
```

El backend se inicia automáticamente en:

```text
http://localhost:8000
```

No es necesario abrir una segunda terminal. Si el puerto `8443` está ocupado, Vite seleccionará automáticamente otro puerto libre.

### 5. Ejecutar las pruebas

```powershell
py backend\manage.py test clientes
pnpm build
```

### Comandos útiles del backend

```powershell
py backend\manage.py check
py backend\manage.py runserver 0.0.0.0:8000
```

### Detener la aplicación

En la terminal donde se ejecuta `pnpm dev`, presionar:

```text
Ctrl+C
```

## 📌 Descripción General

**EcoTerra** es una empresa especializada en soluciones con polímeros para el control de polvo y la estabilización de caminos en áreas industriales y mineras. Parte de sus productos son adquiridos en Estados Unidos y trasladados a Chile vía transporte marítimo.

Este proyecto corresponde a un **Sistema de Gestión de Inventario, Cotizaciones, Facturación y Predicciones con IA**, diseñado para centralizar la operación logística y comercial, permitiendo una toma de decisiones informada basada en modelos analíticos.

> **Proyecto Capstone** — Ingeniería en Informática (Versión 1.1)

---

## ✨ Módulos y Funcionalidades

El sistema está estructurado en tres módulos clave:

### 📦 1. Gestión Operativa e Inventario
* **Clientes y Direcciones:** Registro de clientes y soporte para múltiples direcciones de despacho.
* **Productos y Lotes:** Control detallado de características, envases, ubicación y fechas de fabricación/vencimiento.
* **Control de Inventario:** Consulta de existencias en tiempo real y registro de movimientos de entrada, salida y ajuste.
* **Gestión de Proveedores:** Administración básica mediante operaciones CRUD.
* **Usuarios y Seguridad:** Control de acceso basado en roles y autenticación.

### 📄 2. Cotizaciones y Facturación
* **Ciclo Comercial:** Creación y consulta de cotizaciones, vinculación con Órdenes de Compra (OC) y generación de facturas.
* **Gestión de Documentos:** Emisión de facturas detalladas y notas de crédito asociadas.
* **Seguridad en PDFs:** Generación de documentos comerciales en PDF no editables con almacenamiento seguro.
* **Notificaciones:** Envío directo de cotizaciones y facturas por correo electrónico.

### 🧠 3. Módulo de Inteligencia Artificial
* Integración de modelos predictivos que actúan como apoyo analítico para la gestión comercial y la reposición de stock.

---

## 🤖 Modelos de Inteligencia Artificial

Desarrollados en **Python** utilizando **Scikit-Learn**, orientados al apoyo en la toma de decisiones:

| Modelo | Entradas (Features) | Salida (Target) | Propósito |
| :--- | :--- | :--- | :--- |
| **⏱️ Tiempo de Llegada** | Puerto de origen, Naviera, Tipo de carga, Mes | Días estimados de arribo | Estimar tiempos de traslado marítimo EE.UU. ➔ Chile. |
| **💰 Predicción de Precio** | Producto, Fecha, Cantidad | Precio esperado ($) | Proyectar variaciones de precios basadas en historial de ventas. |
| **📊 Reposición de Stock** | Stock actual, Ventas promedio, Stock mínimo | Días restantes antes del desabastecimiento | Planificar compras y evitar quiebres de inventario. |

---

## 🏗️ Arquitectura del Sistema

El sistema utiliza una arquitectura cliente-servidor por capas:

```mermaid
graph TD
    A[Actor: Usuario / Operador] -->|HTTP / REST| B[Frontend: React + Tailwind CSS]
    B -->|API REST| C[Backend: Django REST Framework]
    C -->|Acceso a Datos| D[(BD: PostgreSQL)]
    C -->|Solicitud de Predicciones| E[Módulo IA: Scikit-Learn]
    E -->|Modelos| F1[Predicción Tiempo Llegada]
    E -->|Modelos| F2[Predicción Precio]
    E -->|Modelos| F3[Predicción Reposición Stock]
