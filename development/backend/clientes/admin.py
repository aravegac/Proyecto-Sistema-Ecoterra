from django.contrib import admin

from .models import Cliente, Direccion


class DireccionInline(admin.TabularInline):
    model = Direccion
    extra = 0


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ("rut", "razon_social", "ciudad", "estado")
    list_filter = ("estado", "ciudad")
    search_fields = ("rut", "razon_social", "nombre_fantasia")
    inlines = [DireccionInline]


@admin.register(Direccion)
class DireccionAdmin(admin.ModelAdmin):
    list_display = ("nombre", "cliente", "ciudad", "tipo", "principal")
    list_filter = ("tipo", "principal", "ciudad")
    search_fields = ("nombre", "cliente__razon_social")
