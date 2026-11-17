# backend/usuarios/models.py
import sys
from django.db import models

class Usuario(models.Model):
    id = models.AutoField(primary_key=True, db_column="id_usuario")
    id_rol = models.IntegerField(default=3, db_column="id_rol")
    nombre = models.CharField(max_length=150, db_column="nombre_usuario")
    email = models.EmailField(max_length=150, unique=True, db_column="correo_usuario")
    contrasena = models.CharField(max_length=255, db_column="contrasena_usuario", default="")
    activo = models.BooleanField(default=True, db_column="activo_usuario")
    
    # NUEVO CAMPO: Guarda los permisos personalizados como JSON
    permisos = models.JSONField(default=dict, blank=True, db_column="permisos_usuario")

    class Meta:
        db_table = "usuario"
        managed = "test" in sys.argv
        ordering = ["nombre"]
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"

    def __str__(self):
        return f"{self.nombre} ({self.email})"