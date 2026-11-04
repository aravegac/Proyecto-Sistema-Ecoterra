# backend/ventas/views.py
import os
import logging
from uuid import uuid4
from io import BytesIO
from decimal import Decimal
from xml.sax.saxutils import escape
from PIL import Image as PillowImage

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm

from supabase import create_client

from usuarios.permissions import PermisoModulo
from .models import OrdenCompra, NotaCredito
from facturacion.models import Factura
from .serializers import OrdenCompraSerializer, NotaCreditoSerializer

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

def _logo_proporcional(ruta, ancho_max, alto_max):
    with PillowImage.open(ruta) as original:
        imagen = original.convert("RGBA")
        bounds = imagen.getchannel("A").getbbox()
        imagen = imagen.crop(bounds) if bounds else imagen
        ruta = BytesIO()
        imagen.save(ruta, format="PNG")
        ruta.seek(0)
    ancho, alto = ImageReader(ruta).getSize()
    escala = min(ancho_max / ancho, alto_max / alto)
    return Image(ruta, width=ancho * escala, height=alto * escala, hAlign="LEFT")


def generar_pdf_nota_credito(nota):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontSize = 9
    normal.leading = 13
    moneda = nota.moneda
    operacion = nota.tipo_operacion
    porcentaje_iva = 0 if operacion == "Internacional" else 19

    def paragraph(value):
        return Paragraph(escape(str(value if value is not None else "")).replace("\n", "<br/>"), normal)

    def money(value):
        numero = f"{Decimal(str(value)):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
        return f"{moneda} {numero}"

    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=14*mm, leftMargin=14*mm,
        topMargin=14*mm, bottomMargin=18*mm,
        title=f"Nota de crédito {nota.numero_nc}", author="Sistema Ecoterra",
    )
    factura = nota.id_factura
    cliente = factura.id_cliente
    logo = _logo_proporcional(os.path.join(settings.BASE_DIR, "static", "logo.png"), 82*mm, 20*mm)
    header = Table([[
        [logo, Spacer(1, 3*mm), paragraph("Ecoterra LLC."),
         paragraph("600 CLEVELAND STREET STE 393 OFC 665")],
        [Paragraph("NOTA DE CRÉDITO", styles["Heading2"]), paragraph(nota.numero_nc),
         paragraph(f"Fecha: {nota.fecha_emision:%d-%m-%Y}"),
         paragraph(f"Factura de origen: {factura.numero_factura}"), paragraph(f"Estado: {nota.estado}")],
    ]], colWidths=[110*mm, 72*mm])
    section_style = [
        ("BOX", (0, 0), (-1, -1), .7, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]
    header.setStyle(TableStyle(section_style))
    customer = Table([[
        [paragraph("CLIENTE"), paragraph(cliente.razon_social),
         paragraph(f"RUT: {cliente.rut}"),
         paragraph(" · ".join(filter(None, [cliente.pais, cliente.region, cliente.ciudad])))],
        [paragraph(f"Teléfono: {cliente.telefono or '-'}"), paragraph(f"Email: {cliente.email or '-'}"),
         paragraph(f"Moneda: {moneda}"), paragraph(f"Tipo de operación: {operacion}")],
    ]], colWidths=[110*mm, 72*mm], splitInRow=1)
    customer.setStyle(TableStyle(section_style + [("LINEAFTER", (0, 0), (0, 0), .7, colors.black)]))
    rows = [[paragraph(value) for value in ("Concepto", "Cantidad", "Subtotal neto")], [
        paragraph(f"Ajuste asociado a factura {factura.numero_factura}"), paragraph(1), paragraph(money(nota.subtotal)),
    ]]
    detail = Table(rows, colWidths=[110*mm, 24*mm, 48*mm], repeatRows=1)
    detail.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), .5, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    totals = Table([
        [paragraph("Subtotal neto"), paragraph(money(nota.subtotal))],
        [paragraph(f"IVA ({porcentaje_iva}%)"), paragraph(money(nota.iva))],
        [paragraph(f"TOTAL {moneda}"), paragraph(money(nota.total))],
    ], colWidths=[40*mm, 48*mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), .5, colors.black),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#DBEADD")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    elements = [
        header, customer, Spacer(1, 5*mm), detail, Spacer(1, 4*mm), totals,
        Spacer(1, 5*mm), Paragraph("Motivo de la nota de crédito", styles["Heading3"]), paragraph(nota.motivo),
    ]

    def footer(canvas, document):
        canvas.setFont("Helvetica", 8)
        canvas.drawString(14*mm, 10*mm, f"Ecoterra - {nota.numero_nc}")
        canvas.drawRightString(196*mm, 10*mm, f"Página {document.page}")

    doc.build(elements, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


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
    
    @action(detail=True, methods=["patch"], url_path="estado")
    def actualizar_estado(self, request, pk=None):
        nota = self.get_object()
        nuevo_estado = request.data.get("estado")
        estados_validos = ["PENDIENTE", "EMITIDA", "ANULADA"]
        if nuevo_estado not in estados_validos:
            return Response({"error": "Estado no válido.", "permitidos": estados_validos}, status=status.HTTP_400_BAD_REQUEST)
        nota.estado = nuevo_estado
        nota.save(update_fields=["estado"])
        return Response({"mensaje": "Estado actualizado.", "estado": nota.estado}, status=status.HTTP_200_OK)
        
    @action(detail=True, methods=["post"], url_path="generar-pdf")
    def generar_pdf(self, request, pk=None):
        nota = self.get_object()
        try:
            contenido_pdf = generar_pdf_nota_credito(nota)
            cliente_supabase = obtener_cliente_supabase()
            bucket = obtener_nombre_bucket()
            ruta_storage = f"notas-credito/{nota.pk}/{uuid4().hex}.pdf"
            
            cliente_supabase.storage.from_(bucket).upload(
                ruta_storage, contenido_pdf,
                file_options={"content-type": "application/pdf", "upsert": "false"}
            )
            
            nota.ruta_pdf_nc = ruta_storage
            nota.save(update_fields=["ruta_pdf_nc"])
            
            return Response({"mensaje": "PDF generado.", "ruta_pdf_nc": nota.ruta_pdf_nc}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Error al generar PDF de NC")
            return Response({"error": "No se pudo generar el PDF."}, status=500)

    @action(detail=True, methods=["get"], url_path="pdf")
    def obtener_pdf(self, request, pk=None):
        nota = self.get_object()
        if not nota.ruta_pdf_nc:
            return Response({"error": "PDF no generado."}, status=status.HTTP_404_NOT_FOUND)
        try:
            cliente_supabase = obtener_cliente_supabase()
            bucket = obtener_nombre_bucket()
            resultado = cliente_supabase.storage.from_(bucket).create_signed_url(nota.ruta_pdf_nc, 300)
            url = resultado.get("signedURL") or resultado.get("signedUrl")
            if not url: raise RuntimeError("Sin URL")
            if url.startswith("/"):
                base_url = os.getenv("SUPABASE_URL") or getattr(settings, "SUPABASE_URL", "")
                url = base_url.rstrip("/") + url
            return Response({"url": url})
        except Exception:
            return Response({"error": "No se pudo generar el enlace."}, status=502)
