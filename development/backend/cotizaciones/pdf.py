"""Formato de cotización generado a partir del registro persistido."""
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from facturacion.views import formato_moneda


# Construye en memoria el PDF de la cotización con cliente, productos, totales y numeración de páginas.
def generar_pdf_cotizacion(cotizacion):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontSize = 9
    normal.leading = 13

    # Escapa el contenido recibido y lo convierte en un párrafo de ReportLab.
    def paragraph(value):
        return Paragraph(escape(str(value or "")), normal)

    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18*mm,
                            rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm,
                            title=f"Cotización {cotizacion.numero_cotizacion}",
                            author="Sistema Ecoterra")
    cliente = cotizacion.id_cliente
    elements = [Paragraph("ECOTERRA · COTIZACIÓN", styles["Title"])]
    for value in (
        f"Número: {cotizacion.numero_cotizacion}",
        f"Emisión: {cotizacion.fecha_cotizacion:%d-%m-%Y}",
        f"Válida hasta: {cotizacion.vigencia_cotizacion:%d-%m-%Y}",
        f"Cliente: {cliente.razon_social}",
        f"RUT: {cliente.rut}",
        f"Condición de pago: {cotizacion.condicion_pago_cotizacion}",
        f"Estado: {cotizacion.estado_cotizacion}",
    ):
        elements.append(paragraph(value))
    elements.append(Spacer(1, 8*mm))
    rows = [[paragraph(v) for v in ("Producto / descripción", "Cantidad", "Precio unitario", "Subtotal")]]
    for line in cotizacion.detallecotizacion_set.all().order_by("id_dc"):
        rows.append([paragraph(line.descripcion_dc), paragraph(line.cantidad_dc),
                     paragraph(formato_moneda(line.precio_unitario_dc)),
                     paragraph(formato_moneda(line.subtotal_dc))])
    table = Table(rows, colWidths=[79*mm, 22*mm, 36*mm, 37*mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DBEADD")),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#CED8D0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.extend([table, Spacer(1, 6*mm)])
    for label, value in (("Subtotal", cotizacion.subtotal_cotizacion),
                         ("IVA", cotizacion.iva_cotizacion),
                         ("Total CLP", cotizacion.total_cotizacion)):
        elements.append(paragraph(f"{label}: {formato_moneda(value)}"))
    if cotizacion.observacion_cotizacion:
        elements.extend([Spacer(1, 5*mm), paragraph(cotizacion.observacion_cotizacion)])

    # Escribe el número de página en el pie de cada hoja del PDF.
    def footer(canvas, document):
        canvas.setFont("Helvetica", 8)
        canvas.drawString(18*mm, 10*mm, "Ecoterra - Cotización comercial")
        canvas.drawRightString(192*mm, 10*mm, f"Página {document.page}")

    doc.build(elements, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
