# backend/facturacion/views.py

import os
import logging
from uuid import uuid4
from io import BytesIO
from decimal import Decimal
from xml.sax.saxutils import escape

logger = logging.getLogger(__name__)

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from reportlab.lib.utils import ImageReader  
from reportlab.platypus import Image          
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


from supabase import create_client

from usuarios.permissions import PermisoModulo
from .models import Factura, DetalleFactura
from ventas.views import OrdenCompraViewSet as VentasOrdenCompraViewSet
from .serializers import FacturaSerializer, OrdenCompraSerializer


# ============================================================
# SUPABASE STORAGE
# ============================================================


# Crea el cliente de Supabase con la URL y la clave secreta configuradas o informa que faltan.
def obtener_cliente_supabase():
    url = os.getenv("SUPABASE_URL") or getattr(
        settings, "SUPABASE_URL", ""
    )

    clave = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or getattr(settings, "SUPABASE_SECRET_KEY", "")
        or getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    )

    if not url or not clave:
        raise RuntimeError(
            "Faltan SUPABASE_URL o una clave secreta de Supabase "
            "en la configuración del backend."
        )

    return create_client(url, clave)



# Obtiene el bucket configurado para los PDF o utiliza facturas-pdf como valor predeterminado.
def obtener_nombre_bucket():
    return (
        os.getenv("SUPABASE_STORAGE_BUCKET")
        or getattr(settings, "SUPABASE_STORAGE_BUCKET", "")
        or "facturas-pdf"
    )


# ============================================================
# UTILIDADES PDF
# ============================================================

# Formatea un importe con símbolo de peso, miles con punto y dos decimales con coma.
def formato_moneda(valor):
    """
    Formato chileno: $10.000,00.
    Conserva los decimales almacenados en la base de datos.
    """
    numero = Decimal(str(valor or 0))
    texto = f"{numero:,.2f}"
    texto = texto.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"${texto}"


# Formatea un importe con miles separados por coma y dos decimales separados por punto.
def _num(valor):
    """Formato de la plantilla: 6,049.44"""
    return f"{Decimal(str(valor or 0)):,.2f}"


# Calcula la escala del logo para que quepa en el espacio indicado sin deformarlo.
def _logo_proporcional(ruta, ancho_max, alto_max):
    """Carga el logo sin deformarlo, ajustado a un recuadro máximo."""
    ancho, alto = ImageReader(ruta).getSize()
    escala = min(ancho_max / ancho, alto_max / alto)
    return Image(ruta, width=ancho * escala, height=alto * escala, hAlign="LEFT")


# Construye en memoria el PDF de la factura con el diseño comercial, logo, cliente, productos y totales.
def generar_pdf_factura(factura):
    """
    Genera el PDF de la factura replicando la plantilla Ecoterra (Invoice):
    un único marco exterior con logo, encabezado, cliente, tabla de ítems
    con columnas verticales, totales y recuadro de observaciones.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    # ---------------- ESTILOS ----------------
    base = getSampleStyleSheet()["Normal"]

    # Crea un estilo de párrafo combinando los valores base con las opciones recibidas.
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
    s_cli_dir = est("clidir", fontName="Times-Roman", fontSize=5.5, leading=7)
    s_contacto = est("contacto", fontName="Times-Roman", fontSize=7, leading=10)
    s_valor = est("valor", fontSize=7, leading=10)

    # ---------------- DATOS ----------------
    cliente = factura.id_cliente
    razon_social = escape(str(getattr(cliente, "razon_social", "") or "Cliente"))
    partes_dir = [
        getattr(cliente, "direccion", ""),
        getattr(cliente, "ciudad", ""),
        getattr(cliente, "pais", "") or "Chile",
    ]
    direccion = escape(" - ".join(str(p) for p in partes_dir if p).upper())
    telefono = escape(str(getattr(cliente, "telefono", "") or ""))
    email = escape(str(getattr(cliente, "email", "") or ""))

    f = factura.fecha_emision
    fecha_txt = f"{f.month}/{f.day}/{f.year}"  # 5/24/2024 como en la plantilla

    # Rejilla de 7 columnas (suman 190 mm).
    # La columna DESCRIPTION de la tabla = columnas 2 y 3 combinadas.
    col_w = [11 * mm, 17 * mm, 70 * mm, 34 * mm, 20 * mm, 20 * mm, 18 * mm]
    ULT = 6

    rows, alturas, cmds = [], [], []

    # Añade una fila y su altura a la tabla del PDF y devuelve su índice.
    def fila(celdas, alto):
        rows.append(celdas + [""] * (7 - len(celdas)))
        alturas.append(alto * mm)
        return len(rows) - 1

    # ---------------- 0. LOGO ----------------
    logo_path = os.path.join(settings.BASE_DIR, "static", "logo.png")
    if os.path.exists(logo_path):
        logo = _logo_proporcional(logo_path, 110 * mm, 19 * mm)
    else:
        logger.warning("No se encontró el logo en %s", logo_path)
        logo = Paragraph(
            '<font size="24" color="#009933"><b>Eco</b></font>'
            '<font size="24" color="#333333"><b>Terra</b></font>',
            s_txt,
        )
    r = fila([logo], 23)
    cmds += [
        ("SPAN", (0, r), (ULT, r)),
        ("VALIGN", (0, r), (ULT, r), "MIDDLE"),
        ("LEFTPADDING", (0, r), (0, r), 3 * mm),
        ("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black),
    ]

    # ---------------- 1-2. EMPRESA / INVOICE / FECHA ----------------
    r = fila(
        [Paragraph("Ecoterra LLC.", s_empresa), "", "", "",
         Paragraph("Invoice", s_invoice), Paragraph(escape(str(factura.numero_factura)), s_inv_num), ""],
        9,
    )
    cmds += [
        ("SPAN", (0, r), (3, r)),
        ("SPAN", (5, r), (6, r)),
        ("VALIGN", (0, r), (ULT, r), "BOTTOM"),
    ]
    r = fila(
        [Paragraph("600 CLEVELAND STREET STE 393 OFC 665", s_txt), "", "", "",
         Paragraph("Fecha:", s_fecha_lbl), Paragraph(fecha_txt, s_txt), ""],
        8,
    )
    cmds += [
        ("SPAN", (0, r), (3, r)),
        ("SPAN", (5, r), (6, r)),
        ("VALIGN", (0, r), (ULT, r), "MIDDLE"),
        ("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black),
    ]

    # ---------------- 3-4. CLIENTE / CONTACTO ----------------
    r_cli = fila([Paragraph("Cliente:", s_cli_lbl)], 5.5)
    cmds += [
        ("SPAN", (0, r_cli), (2, r_cli)),
        ("SPAN", (3, r_cli), (ULT, r_cli)),
        ("VALIGN", (0, r_cli), (ULT, r_cli), "TOP"),
    ]
    r = fila(
        [[Paragraph(razon_social, s_cli), Paragraph(direccion, s_cli_dir)], "", "",
         Paragraph("FONO:<br/>MAIL:", s_contacto),
         Paragraph(f"{telefono}<br/>{email}", s_valor), "", ""],
        14,
    )
    cmds += [
        ("SPAN", (0, r), (2, r)),
        ("SPAN", (4, r), (ULT, r)),
        ("VALIGN", (0, r), (ULT, r), "TOP"),
        ("TOPPADDING", (0, r), (ULT, r), 2.5 * mm),
        ("LEFTPADDING", (3, r), (3, r), 18 * mm),
        ("LINEAFTER", (2, r_cli), (2, r), 0.7, colors.black),
        ("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black),
    ]

    # ---------------- 5. TEXTO INTRODUCTORIO ----------------
    r = fila(
        [Paragraph("De acuerdo a lo solicitado, nos es grato cotizarles lo siguiente :", s_bold)],
        4.2,
    )
    cmds += [
        ("SPAN", (0, r), (ULT, r)),
        ("VALIGN", (0, r), (ULT, r), "MIDDLE"),
        ("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black),
    ]

    # ---------------- 6. CABECERA DE LA TABLA ----------------
    r_head = fila(
        [Paragraph("ITEM", s_head), Paragraph("CODE", s_head),
         Paragraph("DESCRIPTION", s_head), "",
         Paragraph("QUANTITY", s_head), Paragraph("UNIT PRICE", s_head),
         Paragraph("AMOUNT", s_head)],
        4.2,
    )
    cmds += [
        ("SPAN", (2, r_head), (3, r_head)),
        ("VALIGN", (0, r_head), (ULT, r_head), "MIDDLE"),
        ("LINEBELOW", (0, r_head), (ULT, r_head), 0.7, colors.black),
    ]

    # ---------------- 7. CUERPO (ítems + filas numeradas vacías) ----------------
    detalles = list(factura.detalles.select_related("id_producto").all())
    total_filas = max(5, len(detalles))
    r_body_ini = len(rows)

    for i in range(1, total_filas + 1):
        if i <= len(detalles):
            d = detalles[i - 1]
            producto = d.id_producto
            codigo = escape(str(getattr(producto, "codigo", "") or ""))
            desc = escape(str(getattr(d, "descripcion_df", "") or getattr(producto, "nombre", "") or ""))
            celdas = [
                Paragraph(str(i), s_center), Paragraph(codigo, s_txt),
                Paragraph(desc, s_txt), "",
                Paragraph(_num(d.cantidad), s_center),
                Paragraph(_num(d.precio_unitario), s_center),
                Paragraph(_num(d.subtotal_df), s_right),
            ]
        else:
            celdas = [Paragraph(str(i), s_center), "", "", "", "", "", ""]

        primera = i == 1
        r = fila(celdas, 4.2 + (3.5 if primera else 0))
        cmds += [
            ("SPAN", (2, r), (3, r)),
            ("VALIGN", (0, r), (ULT, r), "MIDDLE"),
            ("TOPPADDING", (0, r), (ULT, r), 3.5 * mm if primera else 1),
            ("RIGHTPADDING", (6, r), (6, r), 3 * mm),
        ]

    # Relleno inferior del cuerpo para que las líneas verticales lleguen al borde
    r_pad = fila([], 2)
    r_body_fin = r_pad

    # Líneas verticales de columnas (la 3 queda dentro de DESCRIPTION: no se dibuja)
    for col in (1, 2, 4, 5, 6):
        cmds.append(("LINEBEFORE", (col, r_head), (col, r_body_fin), 0.7, colors.black))
    cmds.append(("LINEBELOW", (0, r_body_fin), (ULT, r_body_fin), 0.7, colors.black))

    # Franja vacía entre el cuerpo y los totales
    r = fila([], 3.8)
    cmds.append(("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black))

    # ---------------- 8. TOTALES ----------------
    r_t1 = fila(
        ["", "", "", "", Paragraph("NET VALUE", s_center), "", Paragraph(_num(factura.subtotal), s_right)],
        7.5,
    )
    r_t2 = fila(
        ["", "", "", "", Paragraph("TOTAL", s_center), "", Paragraph(_num(factura.total), s_right)],
        7.5,
    )
    for rr in (r_t1, r_t2):
        cmds += [
            ("SPAN", (0, rr), (3, rr)),
            ("SPAN", (4, rr), (5, rr)),
            ("VALIGN", (0, rr), (ULT, rr), "MIDDLE"),
            ("RIGHTPADDING", (6, rr), (6, rr), 3 * mm),
        ]
    cmds += [
        ("LINEBEFORE", (4, r_t1), (4, r_t2), 0.7, colors.black),
        ("LINEBEFORE", (6, r_t1), (6, r_t2), 0.7, colors.black),
        ("LINEBELOW", (0, r_t2), (ULT, r_t2), 0.7, colors.black),
    ]

    # Franja vacía entre totales y observaciones
    r = fila([], 4)
    cmds.append(("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black))

    # ---------------- 9. OBSERVACIONES (ocupa el resto de la hoja) ----------------
    obs_text = "Mendoza, Argentina"
    alto_total = 242 * mm
    alto_obs = max(25 * mm, alto_total - sum(alturas))

    rows.append([
        [
            Paragraph("Observaciones:", s_bold),
            Spacer(1, 4 * mm),
            Paragraph(
                f'<font name="Times-Roman">CIF:</font>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{escape(obs_text)}',
                s_txt,
            ),
        ],
        "", "", "", "", "", "",
    ])
    alturas.append(alto_obs)
    r = len(rows) - 1
    cmds += [
        ("SPAN", (0, r), (ULT, r)),
        ("VALIGN", (0, r), (ULT, r), "TOP"),
        ("TOPPADDING", (0, r), (ULT, r), 4 * mm),
    ]

    # ---------------- ESTILO GLOBAL Y CONSTRUCCIÓN ----------------
    tabla = Table(rows, colWidths=col_w, rowHeights=alturas, hAlign="CENTER")
    tabla.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
    ] + cmds))

    doc.build([tabla])
    buffer.seek(0)
    return buffer.getvalue()



# ============================================================
# ÓRDENES DE COMPRA
# ============================================================

class OrdenCompraViewSet(VentasOrdenCompraViewSet):
    """Ruta histórica que comparte permisos y reglas con ventas."""

    serializer_class = OrdenCompraSerializer


# ============================================================
# FACTURAS
# ============================================================

class FacturaViewSet(viewsets.ModelViewSet):
    queryset = Factura.objects.select_related(
        "id_cliente",
        "id_orden_compra"
    ).prefetch_related(
        Prefetch(
            "detalles",
            queryset=DetalleFactura.objects.select_related("id_producto")
        )
    )

    serializer_class = FacturaSerializer
    permission_classes = [PermisoModulo]

    permisos_por_metodo = {
        "GET": ("facturacion", "Consultar"),
        "HEAD": ("facturacion", "Consultar"),
        "OPTIONS": ("facturacion", "Consultar"),
        "POST": ("facturacion", "Crear"),
        "PUT": ("facturacion", "Editar"),
        "PATCH": ("facturacion", "Editar"),
        "DELETE": ("facturacion", "Eliminar"),
    }

    # Actualiza la factura y convierte los conflictos de integridad en una respuesta HTTP 409.
    def update(self, request, *args, **kwargs):
        try:
            return super().update(request, *args, **kwargs)
        except IntegrityError:
            return Response({"error": "No se pudo actualizar la factura. Revisa la asociación con la orden de compra."},
                            status=status.HTTP_409_CONFLICT)

    # Valida y crea la factura en una transacción devolviendo HTTP 409 si hay un conflicto de integridad.
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                self.perform_create(serializer)
        except IntegrityError:
            return Response(
                {
                    "error": (
                        "No se pudo crear la factura. "
                        "Comprueba que la orden no tenga ya una factura "
                        "y que el número de factura sea único."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        headers = self.get_success_headers(serializer.data)

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    # --------------------------------------------------------
    # GENERAR Y SUBIR PDF
    # POST /api/facturas/{id}/generar-pdf/
    # --------------------------------------------------------

    # Genera y sube un PDF nuevo de la factura a Supabase y guarda su ruta en la factura.
    @action(
        detail=True,
        methods=["post"],
        url_path="generar-pdf",
    )
    
    def generar_pdf(self, request, pk=None):
        factura = self.get_object()

        try:
            contenido_pdf = generar_pdf_factura(factura)

            cliente_supabase = obtener_cliente_supabase()
            bucket = obtener_nombre_bucket()

            ruta_storage = f"facturas/{factura.pk}/{uuid4().hex}.pdf"

            cliente_supabase.storage.from_(bucket).upload(
                ruta_storage,
                contenido_pdf,
                file_options={
                    "content-type": "application/pdf",
                    "upsert": "false",
                },
            )

            factura.ruta_pdf_factura = ruta_storage
            factura.save(update_fields=["ruta_pdf_factura"])

            return Response(
                {
                    "mensaje": "PDF generado y guardado correctamente.",
                    "numero_factura": factura.numero_factura,
                    "ruta_pdf_factura": factura.ruta_pdf_factura,
                },
                status=status.HTTP_200_OK,
            )

        except Exception:
            logger.exception("Error al generar o guardar el PDF de la factura")
            return Response(
                {
                    "error": (
                        "No se pudo generar o guardar el PDF. "
                        "Revisa la configuración de Supabase Storage "
                        "y los registros del backend."
                    )
                },
                status=500,
            )


    # --------------------------------------------------------
    # OBTENER URL FIRMADA TEMPORAL
    # GET /api/facturas/{id}/pdf/
    # --------------------------------------------------------

    # Obtiene un enlace firmado temporal al PDF de la factura e impide almacenar la respuesta en caché.
    @action(
        detail=True,
        methods=["get"],
        url_path="pdf",
    )
    def obtener_pdf(self, request, pk=None):
        factura = self.get_object()

        if not factura.ruta_pdf_factura:
            return Response(
                {
                    "error": (
                        "Esta factura todavía no tiene un PDF guardado. "
                        "Primero debes generarlo."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            cliente_supabase = obtener_cliente_supabase()
            bucket = obtener_nombre_bucket()

            resultado = (
                cliente_supabase.storage
                .from_(bucket)
                .create_signed_url(
                    factura.ruta_pdf_factura,
                    300,
                )
            )

            url_firmada = (
                resultado.get("signedURL")
                or resultado.get("signedUrl")
            )

            if not url_firmada:
                raise RuntimeError(
                    "Supabase no devolvió una URL firmada."
                )

            if url_firmada.startswith("/"):
                base_url = (
                    os.getenv("SUPABASE_URL")
                    or getattr(settings, "SUPABASE_URL", "")
                )
                url_firmada = base_url.rstrip("/") + url_firmada

            response = Response({
                "numero_factura": factura.numero_factura,
                "url": url_firmada,
                "expira_en_segundos": 300,
            })
            response["Cache-Control"] = "no-store"
            return response

        except Exception:
            return Response(
                {
                    "error": (
                        "No se pudo generar el enlace temporal del PDF. "
                        "Revisa la configuración de Storage y "
                        "los registros del backend."
                    )
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

    # --------------------------------------------------------
    # ACTUALIZAR ESTADO DE FACTURA
    # PATCH /api/facturas/{id}/acciones/
    # --------------------------------------------------------

    # Valida y cambia el estado de la factura e invalida el PDF guardado anteriormente.
    @action(
        detail=True,
        methods=["patch"],
        url_path="acciones",
    )
    def estado(self, request, pk=None):
        factura = self.get_object()
        nuevo_estado = request.data.get("estado")

        estados_validos = [
            opcion[0]
            for opcion in Factura.ESTADO_CHOICES
        ]

        if nuevo_estado not in estados_validos:
            return Response(
                {
                    "error": "Estado no válido.",
                    "estados_permitidos": estados_validos,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        factura.estado = nuevo_estado
        factura.ruta_pdf_factura = ""
        factura.save(update_fields=["estado", "ruta_pdf_factura"])

        return Response(
            FacturaSerializer(factura).data,
            status=status.HTTP_200_OK,
        )