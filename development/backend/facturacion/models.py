# backend/facturacion/models.py
from decimal import Decimal

from django.db import models
from django.db.models import F, Sum, ExpressionWrapper, DecimalField
from django.db.models.functions import Coalesce
from django.core.validators import MinValueValidator

from clientes.models import Cliente
from inventario.models import Producto



class Factura(models.Model):
    ESTADO_CHOICES = [
        ("PENDIENTE", "Pendiente"),
        ("EMITIDA", "Emitida"),
        ("ANULADA", "Anulada"),
        ("PAGADA", "Pagada"),
    ]

    id = models.AutoField(
        primary_key=True,
        db_column="id_factura",
    )

    id_orden_compra = models.OneToOneField(
        "ventas.OrdenCompra",
        on_delete=models.PROTECT,
        db_column="id_oc",
    )

    id_cliente = models.ForeignKey(
        Cliente,
        on_delete=models.PROTECT,
        db_column="id_cliente",
    )

    numero_factura = models.CharField(
        max_length=50,
        unique=True,
        db_column="numero_factura",
    )

    fecha_emision = models.DateField(
        auto_now_add=True,
        db_column="fecha_factura",
    )

    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        db_column="subtotal_factura",
    )

    iva = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        db_column="iva_factura",
    )

    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        db_column="total_factura",
    )

    estado = models.CharField(
        max_length=20,
        choices=ESTADO_CHOICES,
        default="PENDIENTE",
        db_column="estado_factura",
    )

    
    ruta_pdf_factura = models.CharField(
        max_length=255,
        blank=True,
        default="",
        db_column="ruta_pdf_factura",
    )


    class Meta:
        db_table = "factura"
        managed = False
        ordering = ["-fecha_emision"]
        indexes = [
            models.Index(fields=["id_cliente"]),
            models.Index(fields=["numero_factura"]),
        ]

    # Devuelve el número de factura y su cliente como representación textual.
    def __str__(self):
        return f"Factura {self.numero_factura} - {self.id_cliente}"

    # Suma los detalles, calcula IVA del 19 % y total, y opcionalmente actualiza la factura en la base de datos.
    def recalcular_totales(self, guardar=True):
        if not self.pk:
            raise ValueError(
                "La factura debe guardarse antes de calcular sus totales."
            )

        resultado = self.detalles.aggregate(
            subtotal=Coalesce(
                Sum("subtotal_df"),
                Decimal("0.00"),
                output_field=DecimalField(
                    max_digits=24,
                    decimal_places=2,
                ),
            )
        )

        subtotal = resultado["subtotal"] or Decimal("0.00")
        subtotal = subtotal.quantize(Decimal("0.01"))
        iva = (subtotal * Decimal("0.19")).quantize(Decimal("0.01"))

        self.subtotal = subtotal
        self.iva = iva
        self.total = subtotal + iva

        if guardar:
            Factura.objects.filter(pk=self.pk).update(
                subtotal=self.subtotal,
                iva=self.iva,
                total=self.total,
            )



class DetalleFactura(models.Model):
    id = models.AutoField(
        primary_key=True,
        db_column="id_df",
    )

    id_factura = models.ForeignKey(
        Factura,
        on_delete=models.CASCADE,
        db_column="id_factura",
        related_name="detalles",
    )

    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column="id_producto",
    )

    descripcion_df = models.CharField(
        max_length=200,
        db_column="descripcion_df",
    )

    cantidad = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        db_column="cantidad_df",
    )

    precio_unitario = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        db_column="precio_unitario_df",
    )

    subtotal_df = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        db_column="subtotal_df",
    )

    class Meta:
        db_table = "detalle_factura"
        managed = False
    
    # Devuelve el identificador del detalle, el producto y su cantidad.
    def __str__(self):
        return f"Detalle {self.id} - {self.id_producto} x {self.cantidad}"

