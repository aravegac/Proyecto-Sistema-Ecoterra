"""Documento comercial de cotización generado desde el registro persistido."""
from io import BytesIO
from xml.sax.saxutils import escape

from django.conf import settings
from django.utils import timezone
from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from facturacion.views import formato_moneda, _logo_proporcional


def generar_pdf_cotizacion(cotizacion):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontSize = 9
    normal.leading = 13

    def paragraph(value):
        text = "" if value is None else str(value)
        return Paragraph(escape(text).replace("\n", "<br/>"), normal)

    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm,
        topMargin=14*mm, bottomMargin=18*mm,
        title=f"Cotización {cotizacion.numero_cotizacion}", author="Sistema Ecoterra",
    )
    cliente = cotizacion.id_cliente
    operacion = getattr(cotizacion, "tipo_operacion_cotizacion", "Nacional")
    porcentaje_iva = 0 if operacion == "Internacional" else 19
    estado = getattr(cotizacion, "estado_actual", cotizacion.estado_cotizacion)

    # El archivo compartido tiene márgenes transparentes. Ajusta solo su encuadre
    # al incorporarlo al PDF y conserva el recurso original.
    logo_buffer = BytesIO()
    with PillowImage.open(settings.BASE_DIR / "static" / "logo.png") as original:
        logo = original.convert("RGBA")
        bounds = logo.getchannel("A").getbbox()
        logo = logo.crop(bounds) if bounds else logo
        logo.save(logo_buffer, format="PNG")
    logo_buffer.seek(0)
    logo_flowable = _logo_proporcional(logo_buffer, 82*mm, 20*mm)

    header = Table([[
        [logo_flowable, Spacer(1, 3*mm), paragraph("Ecoterra LLC."),
         paragraph("600 CLEVELAND STREET STE 393 OFC 665")],
        [Paragraph("COTIZACIÓN", styles["Heading1"]),
         paragraph(cotizacion.numero_cotizacion),
         paragraph(f"Emisión: {cotizacion.fecha_cotizacion:%d-%m-%Y}"),
         paragraph(f"Válida hasta: {cotizacion.vigencia_cotizacion:%d-%m-%Y}"),
         paragraph(f"Estado: {estado}")],
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
    customer = [
        paragraph("CLIENTE"), paragraph(cliente.razon_social), paragraph(f"RUT: {cliente.rut}"),
        paragraph(f"Representante: {getattr(cliente, 'representante', None) or '-'}"),
    ]
    location = " · ".join(filter(None, [
        getattr(cliente, "pais", ""), getattr(cliente, "region", ""), getattr(cliente, "ciudad", ""),
    ]))
    if location:
        customer.append(paragraph(location))
    direcciones = getattr(cliente, "direcciones", None)
    address_rows = []
    if direcciones is not None:
        for direccion in direcciones.all():
            address = ", ".join(filter(None, [
                direccion.calle, direccion.ciudad, direccion.region, direccion.pais,
            ]))
            address_rows.append([paragraph(f"{getattr(direccion, 'nombre', 'Dirección')}: {address}"), ""])
    contact = [
        paragraph(f"Teléfono: {getattr(cliente, 'telefono', None) or '-'}"),
        paragraph(f"Email: {getattr(cliente, 'email', None) or '-'}"),
        paragraph(f"Condición de pago: {cotizacion.condicion_pago_cotizacion}"),
        paragraph(f"Tipo de operación: {operacion}"),
    ]
    customer_table = Table(
        [[customer, contact], *address_rows], colWidths=[110*mm, 72*mm], splitInRow=1,
    )
    customer_table.setStyle(TableStyle(section_style + [
        ("LINEAFTER", (0, 0), (0, 0), .7, colors.black),
    ] + [("SPAN", (0, row), (-1, row)) for row in range(1, len(address_rows) + 1)]))

    elements = [header, customer_table, Spacer(1, 5*mm)]
    rows = [[paragraph(v) for v in ("Ítem", "Código", "Producto / descripción", "Cantidad", "Precio unitario", "Importe")]]
    for index, line in enumerate(cotizacion.detallecotizacion_set.all().order_by("id_dc"), 1):
        producto = getattr(line, "id_producto", None)
        nombre = getattr(producto, "nombre", "")
        descripcion = line.descripcion_dc
        if nombre and nombre != descripcion:
            descripcion = f"{nombre}\n{descripcion}"
        unidad = getattr(producto, "unidad", "")
        rows.append([
            paragraph(index), paragraph(getattr(producto, "codigo", "")), paragraph(descripcion),
            paragraph(f"{line.cantidad_dc} {unidad}".strip()),
            paragraph(formato_moneda(line.precio_unitario_dc)),
            paragraph(formato_moneda(line.subtotal_dc)),
        ])
    for _ in range(max(0, 6 - len(rows))):
        rows.append(["", "", "", "", "", ""])
    table = Table(
        rows, colWidths=[12*mm, 22*mm, 60*mm, 22*mm, 32*mm, 34*mm],
        repeatRows=1, splitInRow=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ("GRID", (0, 0), (-1, -1), .5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    totals = Table([
        [paragraph("Subtotal neto"), paragraph(formato_moneda(cotizacion.subtotal_cotizacion))],
        [paragraph(f"IVA ({porcentaje_iva}%)"), paragraph(formato_moneda(cotizacion.iva_cotizacion))],
        [paragraph("TOTAL CLP"), paragraph(formato_moneda(cotizacion.total_cotizacion))],
    ], colWidths=[40*mm, 38*mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), .5, colors.black),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#DBEADD")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.extend([table, Spacer(1, 4*mm), totals, Spacer(1, 5*mm), KeepTogether([
        Paragraph("Observaciones", styles["Heading3"]),
        paragraph(cotizacion.observacion_cotizacion or "Sin observaciones adicionales."),
    ])])
    if estado == "Anulada":
        fecha = getattr(cotizacion, "fecha_anulacion", None)
        fecha_texto = timezone.localtime(fecha).strftime("%d-%m-%Y %H:%M") if fecha else "Sin registrar"
        elements.extend([
            Spacer(1, 3*mm), Paragraph("Anulación", styles["Heading3"]),
            paragraph(f"Motivo: {getattr(cotizacion, 'motivo_anulacion', None) or 'Sin registrar'}"),
            paragraph(f"Fecha: {fecha_texto}"),
            paragraph(f"Usuario responsable: {getattr(cotizacion, 'id_usuario_anulacion', None) or 'Sin registrar'}"),
        ])

    def footer(canvas, document):
        canvas.setFont("Helvetica", 8)
        canvas.drawString(14*mm, 10*mm, f"Ecoterra - {cotizacion.numero_cotizacion}")
        canvas.drawRightString(196*mm, 10*mm, f"Página {document.page}")

    doc.build(elements, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
