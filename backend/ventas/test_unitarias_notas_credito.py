from decimal import Decimal

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from config.test_support import SalesTablesMixin
from facturacion.models import Factura
from ventas.models import NotaCredito
from ventas.serializers import NotaCreditoSerializer


class PruebasUnitariasNotasCredito(SalesTablesMixin, TestCase):
    """Pruebas unitarias PU-01 a PU-03 del módulo de notas de crédito."""

    def test_pu_01_calculo_importes_nota_credito(self):
        nota = NotaCredito()

        nota.calcular_totales(Decimal("100.00"))

        self.assertEqual(nota.subtotal, Decimal("100.00"))
        self.assertEqual(nota.iva, Decimal("19.00"))
        self.assertEqual(nota.total, Decimal("119.00"))

    def test_pu_02_rechaza_subtotal_bruto_cero_o_negativo(self):
        campo = NotaCreditoSerializer().fields["subtotal_bruto"]

        for valor in ("0.00", "-0.01", "-100.00"):
            with self.subTest(subtotal_bruto=valor):
                with self.assertRaises(ValidationError):
                    campo.run_validation(valor)

    def test_pu_03_rechaza_factura_anulada(self):
        # Se crea una factura de prueba con los mismos modelos y tablas
        # auxiliares utilizados por las pruebas existentes del proyecto.
        from datetime import date
        from clientes.models import Cliente
        from ventas.models import OrdenCompra

        cliente = Cliente.objects.create(
            rut="76123456-7",
            razon_social="Cliente prueba PU-03",
            ciudad="Santiago",
            telefono="123",
            email="pu03@example.com",
        )
        orden = OrdenCompra.objects.create(
            id_cliente=cliente,
            numero_oc="OC-PU03",
            fecha_oc=date(2026, 10, 25),
            ruta_documento_oc="",
        )
        factura = Factura.objects.create(
            id_orden_compra=orden,
            id_cliente=cliente,
            numero_factura="F-PU03",
            subtotal=Decimal("100.00"),
            iva=Decimal("19.00"),
            total=Decimal("119.00"),
            estado="ANULADA",
        )

        serializer = NotaCreditoSerializer()
        datos = {
            "id_factura": factura,
            "subtotal_bruto": Decimal("100.00"),
        }

        with self.assertRaises(ValidationError) as contexto:
            serializer.validate(datos)

        self.assertIn(
            "No se puede crear una nota de crédito sobre una factura anulada.",
            str(contexto.exception),
        )
