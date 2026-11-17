import { fmtCLP } from "../shared"

type QuoteDetailLine = {
  codigo_producto: string
  nombre_producto: string
  cantidad_dc: number
  precio_unitario_dc: number
  subtotal_dc: number
}

type QuoteDetail = {
  numero_cotizacion: string
  cliente_nombre: string
  cliente_rut: string
  cliente_telefono: string
  cliente_email: string
  cliente_representante: string
  cliente_direcciones: Array<{
    nombre: string
    calle: string
    ciudad: string
    region: string
    pais: string
    principal: boolean
  }>
  fecha_cotizacion: string
  vigencia_cotizacion: string
  condicion_pago_cotizacion: string
  subtotal_cotizacion: number
  iva_cotizacion: number
  total_cotizacion: number
  observacion_cotizacion: string
  estado_cotizacion: string
  detalles: QuoteDetailLine[]
}

// Función que se exporta para abrir la nueva ventana con el HTML
// Construye una vista HTML de la cotización y abre una ventana para imprimirla.
export const printCotizacion = (detail: QuoteDetail) => {
  const direccionPrincipal = detail.cliente_direcciones.find(/* Identifica el elemento buscado evaluando d.principal. */ d => d.principal) || detail.cliente_direcciones[0]

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Cotización ${detail.numero_cotizacion}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          margin: 0;
          padding: 20px;
          color: #000;
          background: #fff;
        }
        .document-container {
          max-width: 800px;
          margin: 0 auto;
          border: 2px solid #000;
        }
        .header {
          display: flex;
          justify-content: space-between;
          padding: 20px;
          border-bottom: 2px solid #000;
        }
        .header-left {
          display: flex;
          flex-direction: column;
        }
        .logo-placeholder {
          font-size: 40px;
          font-weight: 900;
          color: #0f9d58;
          margin-bottom: 10px;
        }
        .company-info {
          font-size: 14px;
          font-weight: 700;
        }
        .company-address {
          font-size: 12px;
          color: #555;
        }
        .header-right {
          text-align: right;
        }
        .doc-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .doc-meta {
          font-size: 14px;
        }
        .client-block {
          display: flex;
          justify-content: space-between;
          padding: 20px;
          border-bottom: 2px solid #000;
        }
        .client-info {
          width: 60%;
          font-size: 14px;
        }
        .client-contact {
          width: 35%;
          font-size: 14px;
        }
        .section-title {
          font-weight: 700;
          margin-bottom: 5px;
          font-size: 13px;
        }
        .table-container {
          width: 100%;
          border-collapse: collapse;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }
        .items-table th, .items-table td {
          border: 1px solid #000;
          padding: 8px;
          font-size: 13px;
        }
        .items-table th {
          background-color: #f0f0f0;
          font-weight: 700;
          text-align: center;
        }
        .items-table td.center { text-align: center; }
        .items-table td.right { text-align: right; }
        .totals-block {
          display: flex;
          justify-content: flex-end;
          border-bottom: 2px solid #000;
        }
        .totals-table {
          width: 40%;
          border-collapse: collapse;
        }
        .totals-table td {
          border: 1px solid #000;
          padding: 8px;
          font-size: 14px;
        }
        .totals-table td.label { text-align: right; font-weight: 600; }
        .totals-table td.value { text-align: right; font-weight: 700; }
        .notes-block {
          padding: 20px;
          font-size: 13px;
          border-bottom: 2px solid #000;
          min-height: 100px;
        }
        .footer {
          padding: 10px;
          text-align: center;
          font-size: 12px;
          color: #555;
        }
        @media print {
          body { padding: 0; }
          .document-container { border: none; }
        }
      </style>
    </head>
    <body>
      <div class="document-container">
        <!-- HEADER -->
        <div class="header">
          <div class="header-left">
            <div class="logo-placeholder">EcoTerra</div>
            <div class="company-info">Ecoterra LLC.</div>
            <div class="company-address">600 CLEVELAND STREET STE 393 OFC 665</div>
          </div>
          <div class="header-right">
            <div class="doc-title">QUOTE</div>
            <div class="doc-meta"><strong>N°:</strong> ${detail.numero_cotizacion}</div>
            <div class="doc-meta"><strong>Fecha:</strong> ${detail.fecha_cotizacion}</div>
            <div class="doc-meta"><strong>Vigencia:</strong> ${detail.vigencia_cotizacion}</div>
          </div>
        </div>

        <!-- CLIENTE -->
        <div class="client-block">
          <div class="client-info">
            <div class="section-title">Cliente:</div>
            <strong>${detail.cliente_nombre}</strong><br/>
            RUT: ${detail.cliente_rut}<br/>
            Representante: ${detail.cliente_representante || '—'}<br/>
            ${direccionPrincipal ? `${direccionPrincipal.calle}, ${direccionPrincipal.ciudad}, ${direccionPrincipal.region}, ${direccionPrincipal.pais}` : ''}
          </div>
          <div class="client-contact">
            <div class="section-title">Contacto:</div>
            <strong>FONO:</strong> ${detail.cliente_telefono || '—'}<br/>
            <strong>MAIL:</strong> ${detail.cliente_email || '—'}
          </div>
        </div>

        <!-- TABLA DE PRODUCTOS -->
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 50px;">ITEM</th>
              <th style="width: 100px;">CÓDIGO</th>
              <th>DESCRIPCIÓN</th>
              <th style="width: 80px;">CANTIDAD</th>
              <th style="width: 100px;">P. UNIT</th>
              <th style="width: 120px;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${detail.detalles.map(/* Transforma cada elemento de la lista devolviendo ` <tr> <td class="center">${idx + 1}</td> <td class="center">${item.codigo_producto}</td> <td>${item.nombre_producto}</td> <td class="center">${Number(item.cantidad_dc).toLocaleString('es-CL')}</td> <td class="right">${fmtCLP(Number(item.precio_unitario_dc))}</td> <td class="right">${fmtCLP(Number(item.subtotal_dc))}</td> </tr> `. */ (item, idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td class="center">${item.codigo_producto}</td>
                <td>${item.nombre_producto}</td>
                <td class="center">${Number(item.cantidad_dc).toLocaleString('es-CL')}</td>
                <td class="right">${fmtCLP(Number(item.precio_unitario_dc))}</td>
                <td class="right">${fmtCLP(Number(item.subtotal_dc))}</td>
              </tr>
            `).join('')}
            <!-- Filas vacías para mantener el estilo de la imagen -->
            ${Array.from({ length: Math.max(0, 5 - detail.detalles.length) }).map(/* Transforma cada elemento de la lista devolviendo ` <tr> <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td> </tr> `. */ () => `
              <tr>
                <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- TOTALES -->
        <div class="totals-block">
          <table class="totals-table">
            <tr>
              <td class="label">NET VALUE</td>
              <td class="value">${fmtCLP(Number(detail.subtotal_cotizacion))}</td>
            </tr>
            <tr>
              <td class="label">IVA (19%)</td>
              <td class="value">${fmtCLP(Number(detail.iva_cotizacion))}</td>
            </tr>
            <tr>
              <td class="label" style="font-size: 16px;">TOTAL</td>
              <td class="value" style="font-size: 16px;">${fmtCLP(Number(detail.total_cotizacion))}</td>
            </tr>
          </table>
        </div>

        <!-- NOTAS / OBSERVACIONES -->
        <div class="notes-block">
          <div class="section-title">NOTES:</div>
          <p style="white-space: pre-wrap;">${detail.observacion_cotizacion || 'Sin observaciones.'}</p>
          <br/>
          <div class="section-title">Condición de pago:</div>
          <p>${detail.condicion_pago_cotizacion}</p>
        </div>
      </div>

      <div class="footer">
        Documento generado por Ecoterra · ${new Date().toLocaleDateString('es-CL')}
      </div>

      <script>
        // Espera a que cargue la fuente y luego imprime
        window.onload = function() {
          setTimeout(() => {
            window.print();
          }, 500);
        }
      </script>
    </body>
    </html>
  `

  // Abrir en una nueva pestaña
  const newWindow = window.open('', '_blank')
  if (newWindow) {
    newWindow.document.write(htmlContent)
    newWindow.document.close()
  } else {
    alert("Por favor, permite las ventanas emergentes para ver el documento.")
  }
}