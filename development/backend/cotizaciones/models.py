# cotizaciones/models.py
from django.db import models


class Cotizacion(models.Model):
    id_cotizacion = models.AutoField(primary_key=True, db_column="id_cotizacion")
    id_cliente = models.ForeignKey(
        "clientes.Cliente",
        on_delete=models.DO_NOTHING,
        db_column="id_cliente",
        to_field="id",
    )
    numero_cotizacion = models.CharField(max_length=50, unique=True, db_column="numero_cotizacion")
    fecha_cotizacion = models.DateField(db_column="fecha_cotizacion")
    dias_vigencia_cotizacion = models.IntegerField(db_column="dias_vigencia_cotizacion")
    vigencia_cotizacion = models.DateField(db_column="vigencia_cotizacion")
    condicion_pago_cotizacion = models.CharField(max_length=100, db_column="condicion_pago_cotizacion")
    subtotal_cotizacion = models.DecimalField(max_digits=12, decimal_places=2, db_column="subtotal_cotizacion")
    iva_cotizacion = models.DecimalField(max_digits=12, decimal_places=2, db_column="iva_cotizacion")
    total_cotizacion = models.DecimalField(max_digits=12, decimal_places=2, db_column="total_cotizacion")
    observacion_cotizacion = models.TextField(null=True, blank=True, db_column="observacion_cotizacion")
    estado_cotizacion = models.CharField(max_length=50, db_column="estado_cotizacion")
    ruta_pdf_cotizacion = models.CharField(max_length=255, db_column="ruta_pdf_cotizacion")

    class Meta:
        db_table = "cotizacion"
        managed = False

    # Devuelve el número de cotización como representación textual.
    def __str__(self):
        return self.numero_cotizacion


class DetalleCotizacion(models.Model):
    id_dc = models.AutoField(primary_key=True, db_column="id_dc")
    id_cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        db_column="id_cotizacion",
    )
    id_producto = models.ForeignKey(
        "inventario.Producto",
        on_delete=models.DO_NOTHING,
        db_column="id_producto",
        to_field="id",
    )
    descripcion_dc = models.CharField(max_length=255, db_column="descripcion_dc")
    cantidad_dc = models.DecimalField(max_digits=12, decimal_places=2, db_column="cantidad_dc")
    precio_unitario_dc = models.DecimalField(max_digits=12, decimal_places=2, db_column="precio_unitario_dc")
    subtotal_dc = models.DecimalField(max_digits=12, decimal_places=2, db_column="subtotal_dc")

    class Meta:
        db_table = "detalle_cotizacion"
        managed = False

    # Devuelve el identificador del detalle y el número de su cotización.
    def __str__(self):
        return f"Detalle {self.id_dc} - {self.id_cotizacion.numero_cotizacion}"