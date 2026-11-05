from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from clientes.models import Cliente
from facturacion.models import Factura, DetalleFactura
from inventario.models import Producto, Inventario
from ventas.models import OrdenCompra


# ---------------------------------------------------------
# CONFIGURACIÓN DE LOS DATOS SINTÉTICOS
# ---------------------------------------------------------

DIAS_ANALISIS = 90
CANTIDAD_FACTURAS = 13

ESTADO_FACTURA = "EMITIDA"
ESTADO_INVENTARIO = "Disponible"

PREFIJO_OC = "OC-IA-TEST-STOCK-"
PREFIJO_FACTURA = "FAC-IA-TEST-STOCK-"
PREFIJO_LOTE = "LOTE-IA-TEST-STOCK-"

# Precio técnico ficticio.
# No representa el precio comercial real de ningún producto.
PRECIO_UNITARIO_PRUEBA = Decimal("1.00")

IVA_NACIONAL = Decimal("0.19")

# Total de litros vendidos durante los 90 días.
# Estos totales reproducen los promedios diarios
# utilizados para construir el conjunto de entrenamiento.
VENTAS_90_DIAS = {
    "POL-001": Decimal("1350.00"),   # 15 L/día
    "POL-002": Decimal("2700.00"),   # 30 L/día
    "POL-003": Decimal("4050.00"),   # 45 L/día
    "POL-004": Decimal("1080.00"),   # 12 L/día
    "POL-005": Decimal("1800.00"),   # 20 L/día
    "POL-008": Decimal("225000.00"), # 2500 L/día
    "POL-009": Decimal("63000.00"),  # 700 L/día
}

CODIGOS_PRODUCTOS = list(VENTAS_90_DIAS.keys())


def redondear(valor):
    """Redondea un valor decimal a dos posiciones."""
    return Decimal(valor).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )


def distribuir_cantidad(total, cantidad_partes):
    """
    Distribuye una cantidad entre varias facturas.
    La suma de las partes siempre coincide con el total.
    """
    total = redondear(total)

    cantidad_base = redondear(
        total / Decimal(cantidad_partes)
    )

    cantidades = [
        cantidad_base
        for _ in range(cantidad_partes - 1)
    ]

    ultima_cantidad = redondear(
        total - sum(cantidades)
    )

    cantidades.append(ultima_cantidad)

    return cantidades


def obtener_fechas_facturas(fecha_actual):
    """
    Genera 13 fechas distribuidas uniformemente
    dentro de los últimos 90 días, incluyendo
    la fecha inicial y la fecha actual.
    """
    fecha_inicio = fecha_actual - timedelta(
        days=DIAS_ANALISIS - 1
    )

    fechas = []

    for indice in range(CANTIDAD_FACTURAS):
        desplazamiento = round(
            indice * (DIAS_ANALISIS - 1)
            / (CANTIDAD_FACTURAS - 1)
        )

        fechas.append(
            fecha_inicio + timedelta(days=desplazamiento)
        )

    return fechas


class Command(BaseCommand):

    help = (
        "Inserta órdenes de compra, facturas, detalles "
        "y lotes ficticios para probar la predicción de stock."
    )

    def handle(self, *args, **options):

        fecha_actual = timezone.localdate()

        self.stdout.write(
            self.style.WARNING(
                "\nINICIANDO CARGA DE DATOS SINTÉTICOS..."
            )
        )

        # -------------------------------------------------
        # 1. COMPROBAR QUE NO EXISTAN DATOS DE UNA CARGA ANTERIOR
        # -------------------------------------------------

        if OrdenCompra.objects.filter(
            numero_oc__startswith=PREFIJO_OC
        ).exists():

            raise CommandError(
                "Ya existen órdenes de compra de esta carga. "
                "Se cancela el proceso para evitar duplicados."
            )

        if Factura.objects.filter(
            numero_factura__startswith=PREFIJO_FACTURA
        ).exists():

            raise CommandError(
                "Ya existen facturas de esta carga. "
                "Se cancela el proceso para evitar duplicados."
            )

        if Inventario.objects.filter(
            codigo_lote__startswith=PREFIJO_LOTE
        ).exists():

            raise CommandError(
                "Ya existen lotes de esta carga. "
                "Se cancela el proceso para evitar duplicados."
            )

        # -------------------------------------------------
        # 2. OBTENER CLIENTE ACTIVO
        # -------------------------------------------------

        cliente = Cliente.objects.filter(
            estado=True
        ).order_by("id").first()

        if cliente is None:
            raise CommandError(
                "No existe ningún cliente activo. "
                "Debes registrar o activar un cliente antes "
                "de ejecutar esta carga."
            )

        # -------------------------------------------------
        # 3. OBTENER LOS PRODUCTOS COMERCIALES
        # -------------------------------------------------

        productos = Producto.objects.filter(
            codigo__in=CODIGOS_PRODUCTOS,
            estado=True
        )

        productos_por_codigo = {
            producto.codigo: producto
            for producto in productos
        }

        productos_faltantes = [
            codigo
            for codigo in CODIGOS_PRODUCTOS
            if codigo not in productos_por_codigo
        ]

        if productos_faltantes:
            raise CommandError(
                "No se encontraron todos los productos activos: "
                + ", ".join(productos_faltantes)
            )

        for producto in productos_por_codigo.values():

            if producto.stock_minimo is None:
                raise CommandError(
                    f"El producto {producto.codigo} "
                    "no tiene stock mínimo configurado."
                )

        # -------------------------------------------------
        # 4. GENERAR FECHAS Y DISTRIBUIR LAS VENTAS
        # -------------------------------------------------

        fechas_facturas = obtener_fechas_facturas(
            fecha_actual
        )

        ventas_distribuidas = {}

        for codigo, total in VENTAS_90_DIAS.items():

            ventas_distribuidas[codigo] = distribuir_cantidad(
                total,
                CANTIDAD_FACTURAS
            )

        # -------------------------------------------------
        # 5. INSERTAR LOS REGISTROS
        # -------------------------------------------------

        total_ordenes = 0
        total_facturas = 0
        total_detalles = 0
        total_lotes = 0

        with transaction.atomic():

            # ---------------------------------------------
            # 5.1 CREAR ÓRDENES DE COMPRA Y FACTURAS
            # ---------------------------------------------

            for indice, fecha in enumerate(
                fechas_facturas,
                start=1
            ):

                numero_oc = (
                    f"{PREFIJO_OC}{indice:02d}"
                )

                numero_factura = (
                    f"{PREFIJO_FACTURA}{indice:02d}"
                )

                # Crear orden de compra.
                orden = OrdenCompra.objects.create(
                    id_cliente=cliente,
                    id_cotizacion=None,
                    numero_oc=numero_oc,
                    fecha_oc=fecha,
                    tipo_operacion_oc="Nacional",
                    ruta_documento_oc=(
                        f"SINTETICO/{numero_oc}.pdf"
                    ),
                )

                total_ordenes += 1

                # Calcular los detalles y el subtotal
                # antes de crear la factura.
                detalles_factura = []
                subtotal_factura = Decimal("0.00")

                for codigo in CODIGOS_PRODUCTOS:

                    producto = productos_por_codigo[codigo]

                    cantidad = ventas_distribuidas[codigo][
                        indice - 1
                    ]

                    subtotal_detalle = redondear(
                        cantidad * PRECIO_UNITARIO_PRUEBA
                    )

                    detalles_factura.append({
                        "producto": producto,
                        "cantidad": cantidad,
                        "subtotal": subtotal_detalle,
                    })

                    subtotal_factura += subtotal_detalle

                subtotal_factura = redondear(
                    subtotal_factura
                )

                iva_factura = redondear(
                    subtotal_factura * IVA_NACIONAL
                )

                total_factura = redondear(
                    subtotal_factura + iva_factura
                )

                # Crear factura.
                factura = Factura.objects.create(
                    id_orden_compra=orden,
                    id_cliente=cliente,
                    numero_factura=numero_factura,
                    subtotal=subtotal_factura,
                    iva=iva_factura,
                    total=total_factura,
                    estado=ESTADO_FACTURA,
                    observacion_factura=(
                        "DATOS SINTÉTICOS PARA PRUEBAS "
                        "DEL MODELO DE PREDICCIÓN DE STOCK."
                    ),
                    moneda_factura="CLP",
                    ruta_pdf_factura="",
                )

                # fecha_emision utiliza auto_now_add.
                # Por eso se actualiza directamente en la BD
                # para asignar la fecha histórica de prueba.
                Factura.objects.filter(
                    pk=factura.pk
                ).update(
                    fecha_emision=fecha
                )

                total_facturas += 1

                # Crear los siete detalles de la factura.
                for detalle in detalles_factura:

                    DetalleFactura.objects.create(
                        id_factura=factura,
                        id_producto=detalle["producto"],
                        descripcion_df=detalle["producto"].nombre,
                        cantidad=detalle["cantidad"],
                        precio_unitario=PRECIO_UNITARIO_PRUEBA,
                        subtotal_df=detalle["subtotal"],
                    )

                    total_detalles += 1

            # ---------------------------------------------
            # 5.2 CREAR LOTES DE INVENTARIO
            # ---------------------------------------------

            for indice, codigo in enumerate(
                CODIGOS_PRODUCTOS,
                start=1
            ):

                producto = productos_por_codigo[codigo]

                # Stock objetivo: 1.5 veces el mínimo.
                # Mantiene los valores dentro del rango
                # utilizado para entrenar el modelo.
                stock_objetivo = redondear(
                    producto.stock_minimo * Decimal("1.50")
                )

                # Obtener el stock disponible actual,
                # excluyendo los lotes reservados y vencidos.
                stock_actual = Inventario.objects.filter(
                    id_producto=producto.id,
                    estado=ESTADO_INVENTARIO,
                    fecha_vencimiento__gt=fecha_actual,
                ).aggregate(
                    total=Sum("cantidad")
                )["total"] or Decimal("0.00")

                stock_actual = redondear(stock_actual)

                # Solo agregar la cantidad faltante.
                # Nunca se eliminan ni reducen lotes existentes.
                cantidad_nuevo_lote = redondear(
                    max(
                        Decimal("0.00"),
                        stock_objetivo - stock_actual
                    )
                )

                if cantidad_nuevo_lote <= 0:
                    self.stdout.write(
                        self.style.WARNING(
                            f"{codigo}: ya tiene "
                            f"{stock_actual} L disponibles. "
                            "No se agrega un lote adicional."
                        )
                    )
                    continue

                codigo_lote = (
                    f"{PREFIJO_LOTE}{indice:02d}"
                )

                # Seleccionar un tipo de envase permitido por Supabase.
                # Se alternan ambos formatos para los productos de prueba.
                tipo_envase = (
                    "IBC 1000 L"
                    if indice % 2 == 1
                    else "Tambor 200 L"
                )

                Inventario.objects.create(
                    id_producto=producto.id,
                    codigo_lote=codigo_lote,
                    cantidad=cantidad_nuevo_lote,
                    tipo_envase=tipo_envase,
                    fecha_fabricacion=(
                        fecha_actual - timedelta(days=30)
                    ),
                    fecha_vencimiento=(
                        fecha_actual + timedelta(days=365)
                    ),
                    ubicacion="Bodega de pruebas",
                    estado=ESTADO_INVENTARIO,
                )

        # -------------------------------------------------
        # 6. MOSTRAR RESUMEN
        # -------------------------------------------------

        self.stdout.write("\n")
        self.stdout.write(
            self.style.SUCCESS(
                "CARGA DE DATOS SINTÉTICOS COMPLETADA."
            )
        )

        self.stdout.write(
            f"Órdenes de compra creadas: {total_ordenes}"
        )

        self.stdout.write(
            f"Facturas creadas: {total_facturas}"
        )

        self.stdout.write(
            f"Detalles de factura creados: {total_detalles}"
        )

        self.stdout.write(
            f"Lotes de inventario creados: {total_lotes}"
        )

        self.stdout.write(
            f"Período de ventas: "
            f"{fechas_facturas[0]} al {fechas_facturas[-1]}"
        )

        self.stdout.write(
            self.style.SUCCESS(
                "\nLos registros quedaron identificados "
                "como datos sintéticos de prueba."
            )
        )
