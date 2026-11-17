from rest_framework import viewsets
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
import logging
from uuid import uuid4
from rest_framework.decorators import action
from rest_framework.response import Response
from facturacion.views import obtener_cliente_supabase, obtener_nombre_bucket
from .pdf import generar_pdf_cotizacion
from usuarios.permissions import PermisoModulo
from .models import Cotizacion, DetalleCotizacion
from .serializers import CotizacionSerializer, DetalleCotizacionSerializer


class CotizacionViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    queryset = (
        Cotizacion.objects
        .select_related("id_cliente")
        .prefetch_related(
            "id_cliente__direcciones",
            "detallecotizacion_set__id_producto",
        )
        .order_by("-id_cotizacion")
    )
    serializer_class = CotizacionSerializer
    permission_classes = [PermisoModulo]

    # Ajusta las acciones según los permisos que tengas en tu base de datos
    # Si en tu BD el módulo se llama "cotizaciones" y las acciones son "Consultar", "Crear", etc.
    permisos_por_metodo = {
        "GET": ("cotizaciones", "Consultar"),
        "POST": ("cotizaciones", "Crear"),
        "PUT": ("cotizaciones", "Editar"),
        "PATCH": ("cotizaciones", "Editar"),
        "DELETE": ("cotizaciones", "Eliminar"),
    }

    def get_permissions(self):
        if self.action == "anular":
            self.permisos_por_metodo = {**self.permisos_por_metodo, "POST": ("cotizaciones", "Eliminar")}
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="anular")
    @transaction.atomic
    def anular(self, request, pk=None):
        self.queryset = self.get_queryset().select_for_update()
        cotizacion = self.get_object()
        motivo = request.data.get("motivo_anulacion")
        if not isinstance(motivo, str) or not motivo.strip():
            raise ValidationError({"motivo_anulacion": "Ingresa el motivo de anulación."})
        actual = cotizacion.estado_actual
        if actual not in {"Borrador", "Vigente", "Vencida", "Aceptada"}:
            raise ValidationError({"detail": "El estado actual no permite anular esta cotización."})
        if cotizacion.ordenes_compra.exists():
            raise ValidationError({"detail": "La cotización tiene documentos comerciales asociados."})
        if actual == "Aceptada" and request.user.id_rol != 1:
            return Response({"detail": "La anulación excepcional de una cotización aceptada requiere un administrador."}, status=403)
        cotizacion.estado_cotizacion = "Anulada"
        cotizacion.fecha_anulacion = timezone.now()
        cotizacion.motivo_anulacion = motivo.strip()
        cotizacion.id_usuario_anulacion = request.user.pk
        cotizacion.save(update_fields=[
            "estado_cotizacion", "fecha_anulacion", "motivo_anulacion", "id_usuario_anulacion",
        ])
        return Response(self.get_serializer(cotizacion).data)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        self.queryset = self.get_queryset().select_for_update()
        return super().update(request, *args, **kwargs)

    # Guarda los cambios de la cotización y vacía la ruta de su PDF anterior.
    def perform_update(self, serializer):
        serializer.save(ruta_pdf_cotizacion="")

    # Genera el PDF de la cotización, lo sube a Storage y guarda la ruta del archivo.
    @action(detail=True, methods=["post"], url_path="generar-pdf")
    def generar_pdf(self, request, pk=None):
        cotizacion = self.get_object()
        # Se conserva cada versión; un fallo al guardar la asociación no pisa el PDF anterior.
        path = f"cotizaciones/{cotizacion.pk}/{uuid4().hex}.pdf"
        try:
            bucket = obtener_cliente_supabase().storage.from_(obtener_nombre_bucket())
            bucket.upload(path, generar_pdf_cotizacion(cotizacion),
                          file_options={"content-type": "application/pdf", "upsert": "false"})
            cotizacion.ruta_pdf_cotizacion = path
            cotizacion.save(update_fields=["ruta_pdf_cotizacion"])
            return Response({"ruta_pdf_cotizacion": path})
        except Exception:
            logging.getLogger(__name__).exception("Error al guardar PDF de cotización")
            return Response({"error": "No se pudo generar o almacenar el PDF. Revisa Storage y los registros del backend."}, status=502)

    # Devuelve un enlace firmado de cinco minutos al PDF existente sin permitir su caché.
    @action(detail=True, methods=["get"], url_path="pdf")
    def obtener_pdf(self, request, pk=None):
        cotizacion = self.get_object()
        if not cotizacion.ruta_pdf_cotizacion:
            return Response({"error": "Primero debes generar el PDF."}, status=404)
        try:
            bucket = obtener_cliente_supabase().storage.from_(obtener_nombre_bucket())
            result = bucket.create_signed_url(cotizacion.ruta_pdf_cotizacion, 300)
            url = result.get("signedURL") or result.get("signedUrl")
            if not url:
                raise RuntimeError("Storage no devolvió un enlace")
            response = Response({"url": url, "expira_en_segundos": 300})
            response["Cache-Control"] = "no-store"
            return response
        except Exception:
            logging.getLogger(__name__).exception("Error al consultar PDF de cotización")
            return Response({"error": "No se pudo consultar el documento almacenado."}, status=502)


class DetalleCotizacionViewSet(viewsets.ModelViewSet):
    queryset = (
    DetalleCotizacion.objects
        .select_related("id_cotizacion", "id_producto")
        .prefetch_related("id_cotizacion__id_cliente")
    )
    serializer_class = DetalleCotizacionSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("cotizaciones", "Consultar"),
        "POST": ("cotizaciones", "Crear"),
        "PUT": ("cotizaciones", "Editar"),
        "PATCH": ("cotizaciones", "Editar"),
        "DELETE": ("cotizaciones", "Eliminar"),
    }
