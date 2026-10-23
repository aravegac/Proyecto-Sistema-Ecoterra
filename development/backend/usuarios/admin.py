from django.contrib import admin

from .models import Usuario


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ("nombre", "email", "id_rol", "activo")
    search_fields = ("nombre", "email")
    list_filter = ("id_rol", "activo")