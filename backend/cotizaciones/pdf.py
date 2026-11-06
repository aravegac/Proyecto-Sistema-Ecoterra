# backend/cotizaciones/pdf.py
"""Documento comercial de cotización generado desde el registro persistido."""

import os
from io import BytesIO
from decimal import Decimal
from xml.sax.saxutils import escape

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def _logo_proporcional(ruta, ancho_max, alto_max):
    """Carga el logo sin deformarlo, ajustado a un recuadro máximo."""
    ancho, alto = ImageReader(ruta).getSize()
    escala = min(ancho_max / ancho, alto_max / alto)
    return Image(ruta, width=ancho * escala, height=alto * escala, hAlign="LEFT")


def _num(valor):
    """Formato de la plantilla: 6,049.44"""
    return f"{Decimal(str(valor or 0)):,.2f}"


def generar_pdf_cotizacion(cotizacion):
    """
    Genera el PDF de la Cotización replicando el diseño de las Facturas.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=10 * mm, leftMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm,
        title=f"Cotización {cotizacion.numero_cotizacion}",  
        author="Ecoterra LLC.",                                
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
    s_cli_dir = est("clidir", fontName="Times-Roman", fontSize=5.5, leading=7)
    s_contacto = est("contacto", fontName="Times-Roman", fontSize=7, leading=10)
    s_valor = est("valor", fontSize=7, leading=10)

    cliente = cotizacion.id_cliente
    razon_social = escape(str(getattr(cliente, "razon_social", "") or "Cliente"))
    partes_dir = [
        getattr(cliente, "direccion", ""),
        getattr(cliente, "ciudad", ""),
        getattr(cliente, "pais", "") or "Chile",
    ]
    direccion = escape(" - ".join(str(p) for p in partes_dir if p).upper())
    telefono = escape(str(getattr(cliente, "telefono", "") or ""))
    email = escape(str(getattr(cliente, "email", "") or ""))

    f = cotizacion.fecha_cotizacion
    fecha_txt = f"{f.month}/{f.day}/{f.year}"

    col_w = [11 * mm, 17 * mm, 70 * mm, 34 * mm, 20 * mm, 20 * mm, 18 * mm]
    ULT = 6
    rows, alturas, cmds = [], [], []

    def fila(celdas, alto):
        rows.append(celdas + [""] * (7 - len(celdas)))
        alturas.append(alto * mm)
        return len(rows) - 1

    # ---------------- 0. LOGO ----------------
    logo_path = os.path.join(settings.BASE_DIR, "static", "logo.png")
    if os.path.exists(logo_path):
        logo = _logo_proporcional(logo_path, 110 * mm, 19 * mm)
    else:
        logo = Paragraph('<font size="24" color="#009933"><b>Eco</b></font><font size="24" color="#333333"><b>Terra</b></font>', s_txt)
    r = fila([logo], 23)
    cmds += [
        ("SPAN", (0, r), (ULT, r)),
        ("VALIGN", (0, r), (ULT, r), "MIDDLE"),
        ("LEFTPADDING", (0, r), (0, r), 3 * mm),
        ("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black),
    ]

    # ---------------- 1-2. EMPRESA / TÍTULO / FECHA ----------------
    r = fila(
        [Paragraph("Ecoterra LLC.", s_empresa), "", "", "",
         Paragraph("Cotización", s_invoice), Paragraph(escape(str(cotizacion.numero_cotizacion)), s_inv_num), ""],
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
        [Paragraph(f"De acuerdo a lo solicitado, nos es grato cotizarles lo siguiente:", s_bold)],
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

    # ---------------- 7. CUERPO (ÍTEMS) ----------------
    detalles = list(cotizacion.detallecotizacion_set.select_related("id_producto").all())
    total_filas = max(5, len(detalles))
    r_body_ini = len(rows)

    for i in range(1, total_filas + 1):
        if i <= len(detalles):
            d = detalles[i - 1]
            producto = d.id_producto
            codigo = escape(str(getattr(producto, "codigo", "") or ""))
            desc = escape(str(getattr(d, "descripcion_dc", "") or getattr(producto, "nombre", "") or ""))
            celdas = [
                Paragraph(str(i), s_center), Paragraph(codigo, s_txt),
                Paragraph(desc, s_txt), "",
                Paragraph(_num(d.cantidad_dc), s_center),
                Paragraph(_num(d.precio_unitario_dc), s_center),
                Paragraph(_num(d.subtotal_dc), s_right),
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

    r_pad = fila([], 2)
    r_body_fin = r_pad

    for col in (1, 2, 4, 5, 6):
        cmds.append(("LINEBEFORE", (col, r_head), (col, r_body_fin), 0.7, colors.black))
    cmds.append(("LINEBELOW", (0, r_body_fin), (ULT, r_body_fin), 0.7, colors.black))

    r = fila([], 3.8)
    cmds.append(("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black))

    # ---------------- 8. TOTALES ----------------
    r_t1 = fila(
        ["", "", "", "", Paragraph("NET VALUE", s_center), "", Paragraph(_num(cotizacion.subtotal_cotizacion), s_right)],
        7.5,
    )
    r_t2 = fila(
        ["", "", "", "", Paragraph("TOTAL", s_center), "", Paragraph(_num(cotizacion.total_cotizacion), s_right)],
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

    r = fila([], 4)
    cmds.append(("LINEBELOW", (0, r), (ULT, r), 0.7, colors.black))

    # ---------------- 9. OBSERVACIONES ----------------
    alto_total = 242 * mm
    alto_obs = max(25 * mm, alto_total - sum(alturas))

    rows.append([
        [
            Paragraph("Observaciones:", s_bold),
            Spacer(1, 4 * mm),
            Paragraph(escape(str(cotizacion.observacion_cotizacion or "")), s_txt),
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