
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework import serializers

from .serializers import OrdenCompraSerializer


class PruebasUnitariasOrdenCompraSprint3(SimpleTestCase):
    """
    Pruebas unitarias aisladas de la validación de cotizaciones
    dentro de OrdenCompraSerializer.
    """

    def crear_serializador(self, cliente_id=1):
        return OrdenCompraSerializer(data={"id_cliente": cliente_id})

    def crear_cotizacion(self, cliente_id=1, estado="Vigente"):
        return SimpleNamespace(
            id_cotizacion=42,
            id_cliente_id=cliente_id,
            estado_cotizacion=estado,
        )

    # PU-06 - Escenario 1
    def test_pu_06_rechaza_cotizacion_de_otro_cliente(self):
        """Rechaza la asociación cuando los clientes son diferentes."""
        serializer = self.crear_serializador(cliente_id=1)
        cotizacion = self.crear_cotizacion(cliente_id=2, estado="Vigente")

        with patch(
            "ventas.serializers.OrdenCompra.objects.filter"
        ) as mock_filter:
            with self.assertRaises(serializers.ValidationError) as error:
                serializer.validate_id_cotizacion(cotizacion)

        self.assertIn("cliente diferente", str(error.exception))
        mock_filter.assert_not_called()

    # PU-06 - Escenario 2
    def test_pu_06_rechaza_cotizacion_no_vigente(self):
        """Rechaza la asociación cuando la cotización no está vigente."""
        serializer = self.crear_serializador(cliente_id=1)
        cotizacion = self.crear_cotizacion(
            cliente_id=1,
            estado="Borrador",
        )

        with patch(
            "ventas.serializers.OrdenCompra.objects.filter"
        ) as mock_filter:
            with self.assertRaises(serializers.ValidationError) as error:
                serializer.validate_id_cotizacion(cotizacion)

        self.assertIn("Vigente", str(error.exception))
        mock_filter.assert_not_called()

    # PU-06 - Escenario 3
    @patch("ventas.serializers.OrdenCompra.objects.filter")
    def test_pu_06_rechaza_cotizacion_ya_asociada(self, mock_filter):
        """Rechaza la asociación cuando ya existe otra OC vinculada."""
        serializer = self.crear_serializador(cliente_id=1)
        cotizacion = self.crear_cotizacion(
            cliente_id=1,
            estado="Vigente",
        )

        queryset_simulado = Mock()
        queryset_simulado.exists.return_value = True
        mock_filter.return_value = queryset_simulado

        with self.assertRaises(serializers.ValidationError) as error:
            serializer.validate_id_cotizacion(cotizacion)

        self.assertIn("ya está asociada", str(error.exception))
        mock_filter.assert_called_once_with(id_cotizacion=cotizacion)
        queryset_simulado.exists.assert_called_once_with()
