# inventario/models.py
import sys

from django.db import models


class Inventario(models.Model):
    id = models.AutoField(primary_key=True, db_column="id_inventario")
    id_producto = models.IntegerField(db_column="id_producto")
    codigo_lote = models.CharField(
        max_length=100, db_column="codigo_lote_inventario", null=True, blank=True
    )
    cantidad = models.DecimalField(
        max_digits=12, decimal_places=2, db_column="cantidad_inventario"
    )
    tipo_envase = models.CharField(max_length=100, db_column="tipo_envase_inventario")
    fecha_fabricacion = models.DateField(db_column="fecha_fabricacion_inventario")
    fecha_vencimiento = models.DateField(db_column="fecha_vencimiento_inventario")
    ubicacion = models.CharField(
        max_length=100, db_column="ubicacion_inventario", null=True, blank=True
    )
    estado = models.CharField(max_length=50, db_column="estado_inventario")

    class Meta:
        db_table = "inventario"
        managed = "test" in sys.argv
        ordering = ["-id"]
        verbose_name = "inventario"
        verbose_name_plural = "inventarios"

    # Devuelve el código de lote o su identificador junto con la cantidad en litros.
    def __str__(self):
        return f"{self.codigo_lote or self.id} ({self.cantidad} L)"


class Movimiento(models.Model):
    id = models.AutoField(primary_key=True, db_column="id_movimiento")
    id_inventario = models.IntegerField(db_column="id_inventario")
    id_usuario = models.IntegerField(db_column="id_usuario")
    tipo_movimiento = models.CharField(max_length=50, db_column="tipo_movimiento")
    cantidad_movimiento = models.DecimalField(
        max_digits=12, decimal_places=2, db_column="cantidad_movimiento"
    )
    fecha_movimiento = models.DateTimeField(db_column="fecha_movimiento")
    referencia = models.CharField(
        max_length=100, db_column="referencia_movimiento", null=True, blank=True
    )
    observacion = models.TextField(
        db_column="observacion_movimiento", null=True, blank=True
    )
    stock_anterior = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        db_column="stock_anterior_movimiento",
        null=True,
        blank=True,
    )
    stock_posterior = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        db_column="stock_posterior_movimiento",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "movimiento"
        managed = "test" in sys.argv
        ordering = ["-fecha_movimiento", "-id"]
        verbose_name = "movimiento"
        verbose_name_plural = "movimientos"

    # Devuelve el tipo de movimiento y su cantidad en litros.
    def __str__(self):
        return f"{self.tipo_movimiento} {self.cantidad_movimiento} L"

    class Meta:
        db_table = "movimiento"
        managed = "test" in sys.argv
        ordering = ["-fecha_movimiento", "-id"]
        verbose_name = "movimiento"
        verbose_name_plural = "movimientos"

    # Devuelve el tipo de movimiento y su cantidad en litros.
    def __str__(self):
        return f"{self.tipo_movimiento} {self.cantidad_movimiento} L"


# 👇 NUEVO: modelo Producto
class Producto(models.Model):
    id = models.AutoField(primary_key=True, db_column="id_producto")
    codigo = models.CharField(
        max_length=50, unique=True, db_column="codigo_producto"
    )
    nombre = models.CharField(max_length=200, db_column="nombre_producto")
    descripcion = models.TextField(
        null=True, blank=True, db_column="descripcion_producto"
    )
    tipo = models.CharField(max_length=100, db_column="tipo_producto")
    unidad = models.CharField(max_length=50, db_column="unidad_medida_producto")
    stock_minimo = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        db_column="stock_minimo_producto",
    )
    estado = models.BooleanField(default=True, db_column="activo_producto")

    class Meta:
        db_table = "producto"
        managed = "test" in sys.argv
        ordering = ["nombre"]
        verbose_name = "producto"
        verbose_name_plural = "productos"

    # Devuelve el código y el nombre como representación textual del producto.
    def __str__(self):
        return f"{self.codigo} - {self.nombre}"