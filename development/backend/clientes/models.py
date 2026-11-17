# clientes/models.py
import sys

from django.db import models


class Cliente(models.Model):
    id = models.AutoField(primary_key=True, db_column="id_cliente")
    rut = models.CharField(max_length=12, db_column="rut_cliente")
    razon_social = models.CharField(max_length=150, db_column="razon_social_cliente")
    nombre_fantasia = models.CharField(
        max_length=150,
        db_column="nombre_fantasia_cliente",
        blank=True,
        null=True,
    )
    ciudad = models.CharField(max_length=100, db_column="ciudad_cliente")
    telefono = models.CharField(max_length=20, db_column="telefono_cliente")
    email = models.EmailField(max_length=150, db_column="correo_cliente")
    representante = models.CharField(
        max_length=100,
        db_column="representante_cliente",
        blank=True,
        null=True,
    )
    estado = models.BooleanField(default=True, db_column="estado_cliente")

    class Meta:
        db_table = "cliente"
        managed = "test" in sys.argv
        ordering = ["razon_social"]
        verbose_name = "cliente"
        verbose_name_plural = "clientes"

    # Devuelve la razón social y el RUT como representación textual del cliente.
    def __str__(self):
        return f"{self.razon_social} ({self.rut})"


class Direccion(models.Model):
    class Tipo(models.TextChoices):
        DESPACHO = "Despacho", "Despacho"
        FACTURACION = "Facturación", "Facturación"
        OTRO = "Otro", "Otro"

    id = models.AutoField(primary_key=True, db_column="id_direccion")
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.CASCADE,
        db_column="id_cliente",
        related_name="direcciones",
    )
    nombre = models.CharField(max_length=100, db_column="nombre_direccion")
    calle = models.CharField(max_length=100, db_column="calle_direccion")
    ciudad = models.CharField(max_length=100, db_column="ciudad_direccion")
    region = models.CharField(max_length=100, db_column="region_direccion")
    pais = models.CharField(max_length=100, db_column="pais_direccion")
    codigo_postal = models.CharField(
        max_length=20,
        db_column="codigo_postal_direccion",
        blank=True,
        null=True,
    )
    tipo = models.CharField(max_length=50, db_column="tipo_direccion", choices=Tipo.choices)
    contacto_recepcion = models.CharField(
        max_length=100,
        db_column="contacto_recepcion_direccion",
    )
    telefono_contacto = models.CharField(
        max_length=20,
        db_column="telefono_contacto_direccion",
    )
    instrucciones_entrega = models.TextField(
        db_column="instrucciones_entrega_direccion",
        blank=True,
        null=True,
    )
    principal = models.BooleanField(default=False, db_column="principal_direccion")

    class Meta:
        db_table = "direccion"
        managed = "test" in sys.argv
        ordering = ["-principal", "nombre"]
        verbose_name = "dirección"
        verbose_name_plural = "direcciones"

    # Devuelve el nombre y la ciudad como representación textual de la dirección.
    def __str__(self):
        return f"{self.nombre} - {self.ciudad}"

