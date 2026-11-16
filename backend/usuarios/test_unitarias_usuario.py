from django.test import SimpleTestCase
from rest_framework import serializers

from .serializers import (
    RolUsuarioField,
    EstadoUsuarioField,
    UsuarioSerializer,
)


class RolUsuarioFieldTests(SimpleTestCase):
    """
    Pruebas unitarias del campo personalizado RolUsuarioField.
    No requieren acceso a la base de datos.
    """

    def setUp(self):
        self.campo = RolUsuarioField()

    def test_pu_09_convierte_superusuario_admin_a_id(self):
        # Arrange: nombre del rol definido en ROLE_LABEL_TO_ID.
        entrada = "Superusuario / Admin"

        # Act: convertir el nombre del rol a su identificador.
        resultado = self.campo.to_internal_value(entrada)

        # Assert: comprobar que corresponde al identificador 1.
        self.assertEqual(resultado, 1)

    def test_pu_10_rechaza_rol_inexistente(self):
        # Arrange: nombre de un rol que no existe en el mapeo.
        entrada = "Rol inexistente"

        # Act / Assert: debe producir un error de validación.
        with self.assertRaises(serializers.ValidationError) as contexto:
            self.campo.to_internal_value(entrada)

        self.assertEqual(
            str(contexto.exception.detail[0]),
            "Rol inválido.",
        )


class EstadoUsuarioFieldTests(SimpleTestCase):
    """
    Pruebas unitarias del campo personalizado EstadoUsuarioField.
    No requieren acceso a la base de datos.
    """

    def setUp(self):
        self.campo = EstadoUsuarioField()

    def test_pu_11_convierte_activo_a_true(self):
        # Arrange
        entrada = "Activo"

        # Act
        resultado = self.campo.to_internal_value(entrada)

        # Assert
        self.assertIs(resultado, True)

    def test_pu_11_convierte_inactivo_a_false(self):
        # Arrange
        entrada = "Inactivo"

        # Act
        resultado = self.campo.to_internal_value(entrada)

        # Assert
        self.assertIs(resultado, False)

class UsuarioSerializerPermisosTests(SimpleTestCase):
    """
    Pruebas unitarias de UsuarioSerializer.validate_permisos().
    No requieren acceso a la base de datos.
    """

    def setUp(self):
        self.serializer = UsuarioSerializer()

    def test_pu_12_acepta_objeto_json_valido(self):
        # Arrange: diccionario que representa un objeto JSON.
        entrada = {
            "clientes": ["crear", "consultar"],
            "inventario": ["consultar"],
        }

        # Act
        resultado = self.serializer.validate_permisos(entrada)

        # Assert: los permisos son aceptados sin modificaciones.
        self.assertEqual(resultado, entrada)

    def test_pu_13_rechaza_valor_que_no_es_objeto_json(self):
        # Arrange: una lista no corresponde a un objeto JSON.
        entrada = ["crear", "consultar"]

        # Act / Assert: se espera un error de validación.
        with self.assertRaises(serializers.ValidationError) as contexto:
            self.serializer.validate_permisos(entrada)

        self.assertEqual(
            str(contexto.exception.detail[0]),
            "Los permisos deben ser un objeto JSON.",
        )