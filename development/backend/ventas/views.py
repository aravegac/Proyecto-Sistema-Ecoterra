# backend/ventas/views.py
import os
import logging
from uuid import uuid4
from io import BytesIO
from decimal import Decimal
from xml.sax.saxutils import escape

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
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
    ancho, alto = ImageReader(ruta).getSize()
    escala = min(ancho_max / ancho, alto_max / alto)
    return Image(ruta, width=ancho * escala, height=alto * escala, hAlign="LEFT")


def generar_pdf_nota_credito(nota):
    """Genera el PDF de la Nota de Crédito con el mismo diseño que las facturas."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=10 * mm, leftMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm,
    )

    base = getSampleStyleSheet()["Normal"]
    def est(nombre, **kw):
        params = dict(parent=base, fontName="Helvetica", fontSize=7, leading=8.5)
        params.update(kw)
        return ParagraphStyle(nombre, **params)

    s_txt = est("txt")
    s_bold = est("bold", fontName="Helvetica-Bold")
    s_head = est("head", fontName="Helvetica-Bold", alignment=TA_CENTER)
    s_center = est("center", alignment=TA_CENTER)
    s_right = est("right", alignment=TA_RIGHT)
    s_empresa = est("empresa", fontName="Times-Bold", fontSize=13, leading=15)
    s_invoice = est("invoice", fontName="Times-Bold", fontSize=12, leading=14)
    s_inv_num = est("invnum", fontName="Times-Roman", fontSize=12, leading=14)
    s_fecha_lbl = est("fechalbl", fontName="Times-Bold", fontSize=6.5)
    s_cli_lbl = est("clilbl", fontName="Times-Bold", fontSize=6.5)
    s_cli = est("cli", fontName="Times-Roman", fontSize=8, leading=9.5)
    s_contacto = est("contacto", fontName="Times-Roman", fontSize=7, leading=10)
    s_valor = est("valor", fontSize=7, leading=10)

    cliente = nota.id_factura.id_cliente
    razon_social = escape(str(getattr(cliente, "razon_social", "") or "Cliente"))
    telefono = escape(str(getattr(cliente, "telefono", "") or ""))
    email = escape(str(getattr(cliente, "email", "") or ""))
    
    f = nota.fecha_emision
    fecha_txt = f"{f.month}/{f.day}/{f.year}"

    col_w = [11 * mm, 17 * mm, 70 * mm, 34 * mm, 20 * mm, 20 * mm, 18 * mm]
    ULT = 6
    rows, alturas, cmds = [], [], []

    def fila(celdas, alto):
        rows.append(celdas + [""] * (7 - len(celdas)))
        alturas.append(alto * mm)
        return len(rows) - 1

    logo_path = os.path.join(settings.BASE_DIR, "static", "logo.png")
    if os.path.exists(logo_path):
        logo = _logo_proporcional(logo_path, 110 * mm, 19 * mm)
    else:
        logo = Paragraph('<font size="24" color="#009933"><b>Eco</b></font><font size="24" color="#333333"><b>Terra</b></font>', s_txt)
    
    r = fila([Paragraph(f"Nota de Crédito asociada a la Factura {nota.id_factura.numero_factura}", s_bold)], 4.2)
    cmds += [("SPAN", (0, r), (ULT, r)), ("VALIGN", (0, r), (ULT, r), "MIDDLE"), ("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black)]

    # Tabla Cabecera
    r_head = fila([Paragraph("ITEM", s_head), Paragraph("CODE", s_head), Paragraph("DESCRIPTION", s_head), Paragraph("", s_txt), Paragraph("QUANTITY", s_head), Paragraph("UNIT PRICE", s_head), Paragraph("AMOUNT", s_head)], 4.2)
    cmds += [("SPAN", (2, r_head), (3, r_head)), ("VALIGN", (0, r_head), (ULT, r_head), "MIDDLE"), ("LINEBELOW", (0, r_head), (ULT, r_head), 0.7, colors.black)]

    # Cuerpo
    celdas = [Paragraph("1", s_center), Paragraph("NC", s_txt), Paragraph(escape(str(nota.motivo)), s_txt), Paragraph("", s_txt), Paragraph("1", s_center), Paragraph(f"{Decimal(str(nota.subtotal)):,.2f}", s_center), Paragraph(f"{Decimal(str(nota.subtotal)):,.2f}", s_right)]
    r = fila(celdas, 8)
    cmds += [("SPAN", (2, r), (3, r)), ("VALIGN", (0, r), (ULT, r), "MIDDLE"), ("TOPPADDING", (0, r), (ULT, r), 3.5 * mm), ("RIGHTPADDING", (6, r), (6, r), 3 * mm)]
    
    r_pad = fila([Paragraph("", s_txt)] * 7, 2) # Relleno con Paragraphs
    r_body_fin = r_pad
    for col in (1, 2, 4, 5, 6):
        cmds.append(("LINEBEFORE", (col, r_head), (col, r_body_fin), 0.7, colors.black))
    cmds.append(("LINEBELOW", (0, r_body_fin), (ULT, r_body_fin), 0.7, colors.black))
    
    r = fila([Paragraph("", s_txt)] * 7, 3.8)
    cmds.append(("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black))

    # Totales
    subtotal_num = Decimal(str(nota.subtotal))
    total_num = Decimal(str(nota.total))
    
    r_t1 = fila([Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("NET VALUE", s_center), Paragraph("", s_txt), Paragraph(f"{subtotal_num:,.2f}", s_right)], 7.5)
    r_t2 = fila([Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("TOTAL", s_center), Paragraph("", s_txt), Paragraph(f"{total_num:,.2f}", s_right)], 7.5)
    for rr in (r_t1, r_t2):
        cmds += [("SPAN", (0, rr), (3, rr)), ("SPAN", (4, rr), (5, rr)), ("VALIGN", (0, rr), (ULT, rr), "MIDDLE"), ("RIGHTPADDING", (6, rr), (6, rr), 3 * mm)]
    cmds += [("LINEBEFORE", (4, r_t1), (4, r_t2), 0.7, colors.black), ("LINEBEFORE", (6, r_t1), (6, r_t2), 0.7, colors.black), ("LINEBELOW", (0, r_t2), (ULT, r_t2), 0.7, colors.black)]
    
    r = fila([Paragraph("", s_txt)] * 7, 4)
    cmds.append(("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black))

    # Observaciones
    alto_total = 242 * mm
    alto_obs = max(25 * mm, alto_total - sum(alturas))
    rows.append([[Paragraph("Observaciones:", s_bold), Spacer(1, 4 * mm), Paragraph(escape(str(nota.motivo)), s_txt)], Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt), Paragraph("", s_txt)])
    alturas.append(alto_obs)
    r = len(rows) - 1
    cmds += [("SPAN", (0, r), (ULT, r)), ("VALIGN", (0, r), (ULT, r), "TOP"), ("TOPPADDING", (0, r), (ULT, r), 4 * mm)]

    tabla = Table(rows, colWidths=col_w, rowHeights=alturas, hAlign="CENTER")
    tabla.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("BOX", (0, 0), (-1, -1), 0.8, colors.black)] + cmds))

    doc.build([tabla])
    buffer.seek(0)
    return buffer.getvalue()


# ============================================================
# ÓRDENES DE COMPRA
# ============================================================

class OrdenCompraViewSet(viewsets.ModelViewSet):
    queryset = OrdenCompra.objects.all().order_by("-id_oc")
    serializer_class = OrdenCompraSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("ordenes_compra", "Consultar"),
        "POST": ("ordenes_compra", "Crear"),
        "PUT": ("ordenes_compra", "Editar"),
        "PATCH": ("ordenes_compra", "Editar"),
        "DELETE": ("ordenes_compra", "Eliminar"),
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        cliente_id = self.request.query_params.get("cliente_id")
        cotizacion_id = self.request.query_params.get("cotizacion_id")
        con_cotizacion = self.request.query_params.get("con_cotizacion")
        fecha_desde = self.request.query_params.get("fecha_desde")
        fecha_hasta = self.request.query_params.get("fecha_hasta")

        if cliente_id: queryset = queryset.filter(id_cliente_id=cliente_id)
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
    queryset = NotaCredito.objects.select_related("id_factura", "id_factura__id_cliente").all().order_by("-fecha_emision", "-id")
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