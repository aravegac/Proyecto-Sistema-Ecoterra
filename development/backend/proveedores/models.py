import sys

from django.db import models


class Proveedor(models.Model):
    id = models.AutoField(primary_key=True, db_column="id_proveedor")
    nombre_empresa = models.CharField(max_length=150, db_column="nombre_proveedor")
    pais = models.CharField(max_length=100, db_column="pais_proveedor")
    contacto = models.CharField(max_length=150, db_column="contacto_proveedor")
    telefono = models.CharField(max_length=50, db_column="telefono_proveedor")
    email = models.EmailField(max_length=150, db_column="correo_proveedor")
    direccion = models.CharField(max_length=255, db_column="direccion_proveedor")

    class Meta:
        db_table = "proveedor"
        managed = "test" in sys.argv
        ordering = ["nombre_empresa"]
        verbose_name = "proveedor"
        verbose_name_plural = "proveedores"

    # Devuelve el nombre de empresa y el país como representación textual del proveedor.
    def __str__(self):
        return f"{self.nombre_empresa} ({self.pais})"