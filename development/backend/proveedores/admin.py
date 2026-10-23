from django.contrib import admin

from .models import Proveedor


@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ("nombre_empresa", "pais", "contacto", "email")
    search_fields = ("nombre_empresa", "contacto", "email", "pais")
    list_filter = ("pais",)