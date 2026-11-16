from django.test import SimpleTestCase
from rest_framework import serializers

from .serializers import (
    normalize_rut,
    EstadoClienteField,
)


class NormalizeRutTests(SimpleTestCase):
    """
    Pruebas unitarias de la normalización y validación del RUT.
    No requieren acceso a la base de datos.
    """

    def test_pu_01_normaliza_rut_chileno_valido(self):
        # Arrange: RUT válido con puntos y guion.
        rut_entrada = "11.111.111-1"

        # Act: ejecutar la función que se desea probar.
        resultado = normalize_rut(rut_entrada)

        # Assert: comprobar el resultado esperado.
        self.assertEqual(resultado, "11111111-1")

    def test_pu_02_rechaza_rut_con_digito_verificador_incorrecto(self):
        # Arrange: RUT con dígito verificador incorrecto.
        rut_entrada = "11.111.111-2"

        # Act / Assert: debe producir un error de validación.
        with self.assertRaises(serializers.ValidationError):
            normalize_rut(rut_entrada)


class EstadoClienteFieldTests(SimpleTestCase):
    """
    Pruebas unitarias del campo personalizado EstadoClienteField.
    """

    def setUp(self):
        self.campo = EstadoClienteField()

    def test_pu_03_convierte_activo_a_true(self):
        # Arrange
        entrada = "Activo"

        # Act
        resultado = self.campo.to_internal_value(entrada)

        # Assert
        self.assertIs(resultado, True)

    def test_pu_04_convierte_inactivo_a_false(self):
        # Arrange
        entrada = "Inactivo"

        # Act
        resultado = self.campo.to_internal_value(entrada)

        # Assert
        self.assertIs(resultado, False)

    def test_pu_05_rechaza_estado_no_permitido(self):
        # Comprueba también la validación de una entrada incorrecta.
        with self.assertRaises(serializers.ValidationError):
            self.campo.to_internal_value("Pendiente")

    def test_pu_06_acepta_booleanos_como_entrada(self):
        # El código admite valores booleanos directamente.
        self.assertIs(self.campo.to_internal_value(True), True)
        self.assertIs(self.campo.to_internal_value(False), False)

    def test_pu_07_representa_estado_activo_como_texto(self):
        resultado = self.campo.to_representation(True)
        self.assertEqual(resultado, "Activo")

    def test_pu_08_representa_estado_inactivo_como_texto(self):
        resultado = self.campo.to_representation(False)
        self.assertEqual(resultado, "Inactivo")