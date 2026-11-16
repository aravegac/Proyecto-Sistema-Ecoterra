from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .serializers import InventarioSerializer, ProductoSerializer


class InventarioSerializerTests(SimpleTestCase):
    """
    Pruebas unitarias de InventarioSerializer.
    No requieren acceso a la base de datos.
    """

    @patch("inventario.serializers.Inventario.objects.create")
    def test_pu_16_genera_codigo_lote_automaticamente(self, mock_create):
        # Arrange
        datos = {
            "id_producto": 1,
            "cantidad": Decimal("25.00"),
            "tipo_envase": "Bidón",
            "fecha_fabricacion": "2026-01-01",
            "fecha_vencimiento": "2027-01-01",
            "estado": "Disponible",
        }

        # Simula la creación del lote y devuelve los datos recibidos.
        mock_create.side_effect = lambda **kwargs: kwargs

        serializer = InventarioSerializer()

        # Act
        resultado = serializer.create(datos.copy())

        # Assert
        codigo = resultado["codigo_lote"]

        self.assertRegex(codigo, r"^LOTE-\d{4}$")
        mock_create.assert_called_once()


class ProductoSerializerTests(SimpleTestCase):
    """
    Pruebas unitarias de ProductoSerializer.get_stock().
    Se simula la consulta de inventario para no usar la base de datos.
    """

    @patch("inventario.serializers.Inventario.objects.filter")
    def test_pu_17_calcula_stock_de_varios_lotes(self, mock_filter):
        # Arrange
        producto = SimpleNamespace(id=1)

        mock_filter.return_value.aggregate.return_value = {
            "total": Decimal("35.50")
        }

        serializer = ProductoSerializer()

        # Act
        resultado = serializer.get_stock(producto)

        # Assert
        self.assertEqual(resultado, 35.5)
        mock_filter.assert_called_once_with(id_producto=1)

    @patch("inventario.serializers.Inventario.objects.filter")
    def test_pu_18_devuelve_cero_si_no_hay_stock(self, mock_filter):
        # Arrange
        producto = SimpleNamespace(id=2)

        mock_filter.return_value.aggregate.return_value = {
            "total": None
        }

        serializer = ProductoSerializer()

        # Act
        resultado = serializer.get_stock(producto)

        # Assert
        self.assertEqual(resultado, 0.0)