# backend/ventas/views.py
import os
import logging
from uuid import uuid4
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response


from supabase import create_client

from clientes.models import Cliente

from usuarios.permissions import PermisoModulo
from .models import OrdenCompra, NotaCredito
from facturacion.models import Factura
from .serializers import OrdenCompraSerializer, NotaCreditoSerializer
from .deteccion_oc import detectar_datos_oc

logger = logging.getLogger(__name__)

# ============================================================
# SUPABASE STORAGE (Copiado para evitar import circular)
# ============================================================

def obtener_cliente_supabase():
    url = os.getenv("SUPABASE_URL") or getattr(settings, "SUPABASE_URL", "")
    clave = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or getattr(settings, "SUPABASE_SECRET_KEY", "")
        or getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    )
    if not url or not clave:
        raise RuntimeError("Faltan SUPABASE_URL o una clave secreta de Supabase.")
    return create_client(url, clave)

def obtener_nombre_bucket():
    return (
        os.getenv("SUPABASE_STORAGE_BUCKET")
        or getattr(settings, "SUPABASE_STORAGE_BUCKET", "")
        or "facturas-pdf"
    )

# ============================================================
# UTILIDADES PDF
# ============================================================

def generar_pdf_nota_credito(nota):
    # Import local: facturacion.views importa este módulo al cargarse.
    from facturacion.views import generar_pdf_documento

    factura = nota.id_factura
    operacion = nota.tipo_operacion
    return generar_pdf_documento(
        titulo="Nota de crédito",
        numero=nota.numero_nc,
        fecha=nota.fecha_emision,
        cliente=factura.id_cliente,
        linea_intro=f"Factura de origen: {factura.numero_factura} - Tipo de operación: {operacion} - Moneda: {nota.moneda} - Estado: {nota.estado}",
        items=[("", f"Ajuste asociado a factura {factura.numero_factura}", 1, nota.subtotal, nota.subtotal)],
        subtotal=nota.subtotal,
        iva=nota.iva,
        total=nota.total,
        porcentaje_iva=0 if operacion == "Internacional" else 19,
        moneda=nota.moneda,
        observaciones=nota.motivo,
        titulo_observaciones="Motivo de la nota de crédito:",
    )


# ============================================================
# ÓRDENES DE COMPRA
# ============================================================

class OrdenCompraViewSet(viewsets.ModelViewSet):
    queryset = OrdenCompra.objects.select_related("id_cliente", "id_cotizacion", "factura").order_by("-id_oc")
    serializer_class = OrdenCompraSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("ordenes_compra", "Consultar"),
        "POST": ("ordenes_compra", "Crear"),
        "PUT": ("ordenes_compra", "Editar"),
        "PATCH": ("ordenes_compra", "Editar"),
        "DELETE": ("ordenes_compra", "Eliminar"),
    }

    def guardar_documento(self, serializer):
        archivo = serializer.validated_data.pop("archivo", None)
        if archivo is None:
            serializer.save()
            return
        ruta = f"ordenes-compra/{uuid4().hex}.pdf"
        try:
            bucket = obtener_cliente_supabase().storage.from_(obtener_nombre_bucket())
            bucket.upload(ruta, archivo.read(), {"content-type": "application/pdf", "upsert": "false"})
        except Exception:
            logger.exception("Error al guardar el documento de la orden de compra")
            error = APIException("No se pudo guardar el PDF. Intenta nuevamente.")
            error.status_code = 502
            raise error
        try:
            serializer.save(ruta_documento_oc=ruta)
        except Exception:
            try:
                bucket.remove([ruta])
            except Exception:
                logger.exception("No se pudo retirar un PDF de una orden que no se guardó")
            raise

    def perform_create(self, serializer):
        self.guardar_documento(serializer)

    def perform_update(self, serializer):
        self.guardar_documento(serializer)

    @action(detail=False, methods=["post"], url_path="detectar")
    def detectar(self, request):
        archivo = request.FILES.get("archivo")
        if archivo is None or archivo.size > 25 * 1024 * 1024 or archivo.read(5) != b"%PDF-":
            return Response({"detail": "Selecciona un PDF válido de hasta 25 MB."}, status=400)
        archivo.seek(0)
        try:
            from pypdf import PdfReader  # import local: si falta pypdf, solo falla la detección
        except ImportError:
            logger.error("Falta instalar pypdf: pip install pypdf")
            return Response({"detail": "La lectura automática de PDF no está disponible."}, status=503)
        try:
            texto = "\n".join(pagina.extract_text() or "" for pagina in PdfReader(archivo).pages[:5])
        except Exception:
            logger.exception("No se pudo leer el texto del PDF de la orden de compra")
            return Response({"detail": "No se pudo leer el PDF."}, status=422)
        clientes = Cliente.objects.values_list("id", "rut", "razon_social", "pais")
        return Response(detectar_datos_oc(texto, clientes))

    @action(detail=True, methods=["get"], url_path="documento")
    def documento(self, request, pk=None):
        orden = self.get_object()
        ruta = orden.ruta_documento_oc
        if not ruta:
            return Response({"detail": "Esta orden no tiene un documento guardado."}, status=404)
        if ruta.startswith(("https://", "http://")):
            response = Response({"url": ruta})
        else:
            try:
                result = obtener_cliente_supabase().storage.from_(obtener_nombre_bucket()).create_signed_url(ruta, 300)
                url = result.get("signedURL") or result.get("signedUrl")
                if not url:
                    raise ValueError("Storage no devolvió un enlace")
                if url.startswith("/"):
                    base_url = os.getenv("SUPABASE_URL") or getattr(settings, "SUPABASE_URL", "")
                    url = base_url.rstrip("/") + url
                response = Response({"url": url, "expira_en_segundos": 300})
            except Exception:
                logger.exception("Error al consultar documento de orden de compra")
                return Response({"detail": "No se pudo abrir el documento. Intenta nuevamente."}, status=502)
        response["Cache-Control"] = "no-store"
        return response

    def get_queryset(self):
        queryset = super().get_queryset()
        cliente_id = self.request.query_params.get("cliente_id")
        cotizacion_id = self.request.query_params.get("cotizacion_id")
        con_cotizacion = self.request.query_params.get("con_cotizacion")
        fecha_desde = self.request.query_params.get("fecha_desde")
        fecha_hasta = self.request.query_params.get("fecha_hasta")
        con_factura = self.request.query_params.get("con_factura")

        if cliente_id: queryset = queryset.filter(id_cliente_id=cliente_id)
        if con_factura == "true": queryset = queryset.filter(factura__isnull=False)
        elif con_factura == "false": queryset = queryset.filter(factura__isnull=True)
        if cotizacion_id: queryset = queryset.filter(id_cotizacion_id=cotizacion_id)
        if con_cotizacion == "true": queryset = queryset.filter(id_cotizacion__isnull=False)
        elif con_cotizacion == "false": queryset = queryset.filter(id_cotizacion__isnull=True)
        if fecha_desde: queryset = queryset.filter(fecha_oc__gte=fecha_desde)
        if fecha_hasta: queryset = queryset.filter(fecha_oc__lte=fecha_hasta)
        return queryset

    @action(detail=True, methods=["post"], url_path="asociar-cotizacion")
    def asociar_cotizacion(self, request, pk=None):
        orden = self.get_object()
        cotizacion_id = request.data.get("id_cotizacion")
        if cotizacion_id is None:
            return Response({"error": "Debes indicar id_cotizacion."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(orden, data={"id_cliente": orden.id_cliente_id, "id_cotizacion": cotizacion_id}, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return Response({"error": "Esta cotización ya está asociada a otra orden de compra."}, status=status.HTTP_409_CONFLICT)
        return Response(self.get_serializer(orden).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], url_path="desasociar-cotizacion")
    def desasociar_cotizacion(self, request, pk=None):
        orden = self.get_object()
        if orden.id_cotizacion_id is None:
            return Response({"mensaje": "La orden ya está sin cotización."}, status=status.HTTP_200_OK)
        orden.id_cotizacion = None
        orden.save(update_fields=["id_cotizacion"])
        return Response(self.get_serializer(orden).data, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        if Factura.objects.filter(id_orden_compra_id=instance.id_oc).exists():
            raise ValidationError("No se puede eliminar una orden que tiene una factura asociada.")
        instance.delete()


# ============================================================
# NOTAS DE CRÉDITO
# ============================================================

class NotaCreditoViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    queryset = NotaCredito.objects.select_related("id_factura", "id_factura__id_cliente", "id_factura__id_orden_compra").all().order_by("-fecha_emision", "-id")
    serializer_class = NotaCreditoSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("notas_credito", "Consultar"),
        "HEAD": ("notas_credito", "Consultar"),
        "OPTIONS": ("notas_credito", "Consultar"),
        "POST": ("notas_credito", "Crear"),
        "PUT": ("notas_credito", "Editar"),
        "PATCH": ("notas_credito", "Editar"),
        "DELETE": ("notas_credito", "Eliminar"),
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        factura_id = self.request.query_params.get("factura_id")
        estado = self.request.query_params.get("estado")
        cliente_id = self.request.query_params.get("cliente_id")

        if factura_id: queryset = queryset.filter(id_factura_id=factura_id)
        if estado: queryset = queryset.filter(estado__iexact=estado)
        if cliente_id: queryset = queryset.filter(id_factura__id_cliente_id=cliente_id)
        return queryset
    
    def get_permissions(self):
        anular = self.action == "anular" or (
            self.action == "actualizar_estado" and isinstance(self.request.data, dict) and self.request.data.get("estado") == "ANULADA"
        )
        if anular:
            self.permisos_por_metodo = {**self.permisos_por_metodo, self.request.method: ("notas_credito", "Eliminar")}
        elif self.action in {"generar_pdf", "actualizar_estado"}:
            self.permisos_por_metodo = {**self.permisos_por_metodo, self.request.method: ("notas_credito", "Editar")}
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response({"detail": "No se pudo guardar la nota por un conflicto de datos. Revisa su número y factura de origen."}, status=409)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        self.queryset = self.get_queryset().select_for_update(of=("self",))
        try:
            return super().update(request, *args, **kwargs)
        except IntegrityError:
            return Response({"detail": "No se pudo actualizar la nota por un conflicto de datos."}, status=409)

    @action(detail=True, methods=["patch"], url_path="estado")
    def actualizar_estado(self, request, pk=None):
        if not isinstance(request.data, dict):
            raise ValidationError("Envía los datos de la acción como un objeto.")
        estado = request.data.get("estado")
        if estado == "EMITIDA":
            return self.generar_pdf(request, pk)
        if estado == "ANULADA":
            return self.anular(request, pk)
        raise ValidationError({"estado": "Usa la generación del PDF para emitir o la acción Anular."})

    @action(detail=True, methods=["post"], url_path="anular")
    @transaction.atomic
    def anular(self, request, pk=None):
        self.queryset = self.get_queryset().select_for_update(of=("self",))
        nota = self.get_object()
        if nota.estado not in {"PENDIENTE", "EMITIDA"}:
            raise ValidationError("El estado actual no permite anular esta nota de crédito.")
        motivo = request.data.get("motivo_anulacion_nc") if isinstance(request.data, dict) else None
        if not isinstance(motivo, str) or not motivo.strip():
            raise ValidationError({"motivo_anulacion_nc": "Ingresa el motivo de anulación."})
        nota.estado = "ANULADA"
        nota.id_usuario_anulacion_nc = request.user.pk
        nota.fecha_anulacion_nc = timezone.now()
        nota.motivo_anulacion_nc = motivo.strip()
        nota.save(update_fields=["estado", "id_usuario_anulacion_nc", "fecha_anulacion_nc", "motivo_anulacion_nc"])
        return Response(self.get_serializer(nota).data)

    @action(detail=True, methods=["post"], url_path="generar-pdf")
    @transaction.atomic
    def generar_pdf(self, request, pk=None):
        from facturacion.models import Factura

        self.queryset = self.get_queryset().select_for_update(of=("self",))
        nota = self.get_object()
        if nota.estado == "ANULADA":
            raise ValidationError("Una nota anulada solo permite consultar su PDF histórico.")
        if nota.estado == "EMITIDA" and nota.ruta_pdf_nc:
            return Response(self.get_serializer(nota).data)
        if nota.estado == "PENDIENTE":
            factura = Factura.objects.select_for_update().select_related("id_orden_compra").get(pk=nota.id_factura_id)
            if factura.estado not in {"EMITIDA", "PAGADA"}:
                raise ValidationError("La factura de origen debe estar emitida o pagada para emitir esta nota.")
            nota.id_factura = factura
            nota.calcular_totales(nota.subtotal)
            if nota.total > Decimal("9999999999.99"):
                raise ValidationError("El total supera el importe máximo permitido.")
            nota.validar_saldo_factura()
            nota.estado = "EMITIDA"

        bucket = None
        ruta = f"notas-credito/{nota.pk}/{uuid4().hex}.pdf"
        uploaded = False
        try:
            contenido = generar_pdf_nota_credito(nota)
            bucket = obtener_cliente_supabase().storage.from_(obtener_nombre_bucket())
            bucket.upload(ruta, contenido, file_options={"content-type": "application/pdf", "upsert": "false"})
            uploaded = True
            nota.ruta_pdf_nc = ruta
            nota.save(update_fields=["estado", "subtotal", "iva", "total", "ruta_pdf_nc"])
            return Response(self.get_serializer(nota).data)
        except Exception:
            transaction.set_rollback(True)
            if uploaded:
                try:
                    bucket.remove([ruta])
                except Exception:
                    logger.exception("No se pudo retirar el PDF de una emisión fallida de NC")
            logger.exception("Error al emitir o generar PDF de NC")
            return Response({"error": "No se pudo emitir la nota y guardar su PDF. Intenta nuevamente."}, status=502)

    @action(detail=True, methods=["get"], url_path="pdf")
    def obtener_pdf(self, request, pk=None):
        nota = self.get_object()
        if nota.estado == "PENDIENTE" or not nota.ruta_pdf_nc:
            return Response({"error": "La nota debe estar emitida y tener un PDF guardado."}, status=status.HTTP_404_NOT_FOUND)
        try:
            cliente_supabase = obtener_cliente_supabase()
            bucket = obtener_nombre_bucket()
            resultado = cliente_supabase.storage.from_(bucket).create_signed_url(nota.ruta_pdf_nc, 300)
            url = resultado.get("signedURL") or resultado.get("signedUrl")
            if not url: raise RuntimeError("Sin URL")
            if url.startswith("/"):
                base_url = os.getenv("SUPABASE_URL") or getattr(settings, "SUPABASE_URL", "")
                url = base_url.rstrip("/") + url
            response = Response({"url": url, "expira_en_segundos": 300})
            response["Cache-Control"] = "no-store"
            return response
        except Exception:
            return Response({"error": "No se pudo generar el enlace."}, status=502)
