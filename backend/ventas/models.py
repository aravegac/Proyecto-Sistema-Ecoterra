from datetime import timezone as datetime_timezone

from django.db import models
from django.utils import timezone


class FechaRegistroUTC(models.DateTimeField):
    """La columna histórica creado_en_nc almacena UTC sin zona horaria."""

    def from_db_value(self, value, expression, connection):
        if value is not None and timezone.is_naive(value):
            return timezone.make_aware(value, datetime_timezone.utc)
        return value
from decimal import Decimal


class OrdenCompra(models.Model):
    id_oc = models.AutoField(primary_key=True, db_column="id_oc")
    id_cliente = models.ForeignKey(
        "clientes.Cliente",
        on_delete=models.DO_NOTHING,
        db_column="id_cliente",
        to_field="id",
        related_name="ordenes_compra",
    )
    id_cotizacion = models.ForeignKey(
        "cotizaciones.Cotizacion",
        on_delete=models.DO_NOTHING,
        db_column="id_cotizacion",
        to_field="id_cotizacion",
        null=True,
        blank=True,
        related_name="ordenes_compra",
    )
    numero_oc = models.CharField(max_length=50, unique=True, db_column="numero_oc")
    fecha_oc = models.DateField(db_column="fecha_oc")
    tipo_operacion_oc = models.CharField(
        max_length=20, default="Nacional",
        choices=[("Nacional", "Nacional"), ("Internacional", "Internacional")],
    )
    ruta_documento_oc = models.CharField(max_length=255, db_column="ruta_documento_oc")

    class Meta:
        db_table = "orden_compra"
        managed = False

    # Devuelve el número de orden de compra como representación textual.
    def __str__(self):
        return self.numero_oc


class NotaCredito(models.Model):
    ESTADO_CHOICES = [
        ("PENDIENTE", "Pendiente"),
        ("EMITIDA", "Emitida"),
        ("ANULADA", "Anulada"),
    ]

    id = models.AutoField(
        primary_key=True,
        db_column="id_nc",
    )

    id_factura = models.ForeignKey(
        "facturacion.Factura",
        on_delete=models.PROTECT,
        db_column="id_factura",
        related_name="notas_credito",
    )

    numero_nc = models.CharField(
        max_length=50,
        unique=True,
        db_column="numero_nc",
    )

    fecha_emision = models.DateField(
        db_column="fecha_emision_nc",
    )

    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        db_column="subtotal_nc",
    )

    iva = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        db_column="iva_nc",
    )

    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
        db_column="total_nc",
    )

    motivo = models.TextField(
        db_column="motivo_nc",
    )

    estado = models.CharField(
        max_length=20,
        choices=ESTADO_CHOICES,
        default="PENDIENTE",
        db_column="estado_nc",
    )

    ruta_pdf_nc = models.CharField(
        max_length=255,
        blank=True,
        default="",
        db_column="ruta_pdf_nc",
    )

    creado_en = FechaRegistroUTC(
        auto_now_add=True,
        db_column="creado_en_nc",
    )
    id_usuario_anulacion_nc = models.IntegerField(null=True, blank=True)
    fecha_anulacion_nc = models.DateTimeField(null=True, blank=True)
    motivo_anulacion_nc = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "nota_credito"
        managed = False
        ordering = ["-fecha_emision", "-id"]
        indexes = [
            models.Index(fields=["id_factura"]),
            models.Index(fields=["numero_nc"]),
        ]

    # Devuelve el número de nota de crédito y el número de la factura asociada.
    def __str__(self):
        return f"NC {self.numero_nc} - Factura {self.id_factura.numero_factura}"

    @property
    def moneda(self):
        return self.id_factura.moneda_factura

    @property
    def tipo_operacion(self):
        return self.id_factura.tipo_operacion

    # Calcula los importes con la tasa de la factura de origen.
    def calcular_totales(self, subtotal_bruto):
        """
        Recibe el subtotal ingresado por el usuario (positivo),
        calcula IVA y total según el tipo de operación de la factura.
        Los montos se guardan en positivo; el front los muestra
        con signo negativo si lo desea.
        """
        subtotal = Decimal(str(subtotal_bruto)).quantize(Decimal("0.01"))
        tasa = Decimal("0") if self.tipo_operacion == "Internacional" else Decimal("0.19")
        iva = (subtotal * tasa).quantize(Decimal("0.01"))
        self.subtotal = subtotal
        self.iva = iva
        self.total = subtotal + iva

    # Total que aún se puede acreditar sobre la factura de origen, sin contar esta nota ni las anuladas.
    def saldo_disponible_factura(self):
        otras = NotaCredito.objects.filter(id_factura_id=self.id_factura_id).exclude(estado="ANULADA")
        if self.pk:
            otras = otras.exclude(pk=self.pk)
        acreditado = otras.aggregate(suma=models.Sum("total"))["suma"] or Decimal("0")
        return self.id_factura.total - acreditado

    # Rechaza una nota cuyo total, sumado a las demás notas vigentes, supere el total de la factura.
    def validar_saldo_factura(self):
        from rest_framework.exceptions import ValidationError

        saldo = self.saldo_disponible_factura()
        if self.total > saldo:
            raise ValidationError({
                "subtotal_bruto": (
                    f"El total de la nota ({self.total}) supera el saldo disponible de la factura "
                    f"{self.id_factura.numero_factura} ({max(saldo, Decimal('0'))})."
                )
            })
