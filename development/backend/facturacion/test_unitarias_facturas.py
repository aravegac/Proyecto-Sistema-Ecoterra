from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from config.test_support import SalesTablesMixin
from clientes.models import Cliente
from inventario.models import Producto
from ventas.models import OrdenCompra
from .models import Factura, DetalleFactura
from .serializers import FacturaSerializer, DetalleFacturaEntradaSerializer


class PruebasUnitariasFacturas(SalesTablesMixin, TestCase):
    """Pruebas unitarias PU-04 a PU-07 del módulo de facturación."""

    def setUp(self):
        self.cliente = Cliente.objects.create(
            rut="76123456-7",
            razon_social="Cliente prueba PU",
            ciudad="Santiago",
            telefono="123",
            email="cliente-pu@example.com",
        )
        self.otro_cliente = Cliente.objects.create(
            rut="11111111-1",
            razon_social="Otro cliente PU",
            ciudad="Santiago",
            telefono="456",
            email="otro-pu@example.com",
        )
        self.producto = Producto.objects.create(
            codigo="QA-PU-FACT-1",
            nombre="Producto prueba PU",
            tipo="Control",
            unidad="Litros",
        )
        self.orden = OrdenCompra.objects.create(
            id_cliente=self.cliente,
            numero_oc="OC-PU-FACT",
            fecha_oc=date(2026, 10, 25),
            ruta_documento_oc="",
        )
        self.factura = Factura.objects.create(
            id_orden_compra=self.orden,
            id_cliente=self.cliente,
            numero_factura="F-PU-FACT",
            subtotal=Decimal("0.00"),
            iva=Decimal("0.00"),
            total=Decimal("0.00"),
        )

    def test_pu_04_recalcula_importes_y_guarda_en_base_de_datos(self):
        DetalleFactura.objects.create(
            id_factura=self.factura,
            id_producto=self.producto,
            descripcion_df=self.producto.nombre,
            cantidad=Decimal("2.00"),
            precio_unitario=Decimal("1000.00"),
            subtotal_df=Decimal("2000.00"),
        )

        self.factura.recalcular_totales(guardar=True)

        self.assertEqual(self.factura.subtotal, Decimal("2000.00"))
        self.assertEqual(self.factura.iva, Decimal("380.00"))
        self.assertEqual(self.factura.total, Decimal("2380.00"))

        self.factura.refresh_from_db()
        self.assertEqual(self.factura.subtotal, Decimal("2000.00"))
        self.assertEqual(self.factura.iva, Decimal("380.00"))
        self.assertEqual(self.factura.total, Decimal("2380.00"))

    def test_pu_05_calcula_subtotal_del_detalle(self):
        serializer = FacturaSerializer()
        datos_detalle = [{
            "id_producto": self.producto,
            "cantidad": Decimal("2.00"),
            "precio_unitario": Decimal("1000.00"),
        }]

        serializer.guardar_detalles(self.factura, datos_detalle)

        detalle = DetalleFactura.objects.get(id_factura=self.factura)
        self.assertEqual(detalle.subtotal_df, Decimal("2000.00"))
        self.assertEqual(detalle.cantidad, Decimal("2.00"))
        self.assertEqual(detalle.precio_unitario, Decimal("1000.00"))

    def test_pu_06_rechaza_cantidades_y_precios_invalidos(self):
        casos_invalidos = (
            ("cantidad", "0"),
            ("cantidad", "-1"),
            ("cantidad", "0.001"),
            ("cantidad", "abc"),
            ("cantidad", "10000000000"),
            ("precio_unitario", "0"),
            ("precio_unitario", "-1"),
            ("precio_unitario", "0.001"),
            ("precio_unitario", "abc"),
            ("precio_unitario", "10000000000"),
        )

        for campo, valor in casos_invalidos:
            with self.subTest(campo=campo, valor=valor):
                datos = {
                    "id_producto": self.producto.pk,
                    "cantidad": "1.00",
                    "precio_unitario": "1.00",
                }
                datos[campo] = valor
                serializer = DetalleFacturaEntradaSerializer(data=datos)
                self.assertFalse(
                    serializer.is_valid(),
                    msg=f"Se aceptó un valor inválido: {campo}={valor}",
                )

    def test_pu_07_rechaza_cliente_distinto_al_de_la_orden(self):
        serializer = FacturaSerializer()
        datos = {
            "id_cliente": self.otro_cliente,
            "id_orden_compra": self.orden,
            "detalles": [{
                "id_producto": self.producto,
                "cantidad": Decimal("1.00"),
                "precio_unitario": Decimal("100.00"),
            }],
        }

        with self.assertRaises(ValidationError) as contexto:
            serializer.validate(datos)

        self.assertIn(
            "El cliente seleccionado no corresponde a la orden de compra.",
            str(contexto.exception),
        )
