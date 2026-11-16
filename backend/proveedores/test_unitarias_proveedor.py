from django.test import SimpleTestCase
from rest_framework import serializers

from .serializers import ProveedorSerializer


class ProveedorSerializerEstadoTests(SimpleTestCase):
    """
    Pruebas unitarias de ProveedorSerializer.validate_estado().
    No requieren acceso a la base de datos.
    """

    def setUp(self):
        self.serializer = ProveedorSerializer()

    def test_pu_14_acepta_estado_activo(self):
        # Arrange
        entrada = "Activo"

        # Act
        resultado = self.serializer.validate_estado(entrada)

        # Assert
        self.assertEqual(resultado, "Activo")

    def test_pu_14_acepta_estado_inactivo(self):
        # Arrange
        entrada = "Inactivo"

        # Act
        resultado = self.serializer.validate_estado(entrada)

        # Assert
        self.assertEqual(resultado, "Inactivo")

    def test_pu_15_rechaza_estado_no_permitido(self):
        # Arrange
        entrada = "Pendiente"

        # Act / Assert
        with self.assertRaises(serializers.ValidationError) as contexto:
            self.serializer.validate_estado(entrada)

        self.assertEqual(
            str(contexto.exception.detail[0]),
            "Debe ser Activo o Inactivo.",
        )