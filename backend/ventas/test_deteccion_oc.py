# backend/ventas/test_deteccion_oc.py
from django.test import SimpleTestCase

from .deteccion_oc import detectar_datos_oc

CLIENTES = [
    (1, "76.123.456-7", "Minera Los Andes S.A.", "Chile"),
    (2, "99.041.053-4", "Andes Trading", "Perú"),
    (3, "", "Minera", "Chile"),
]


class DeteccionOcTests(SimpleTestCase):
    def test_detecta_numero_cliente_por_rut_y_pais_del_documento(self):
        texto = "ORDEN DE COMPRA N° 4500012345\nRUT: 99041053-4\nPaís de origen: Argentina"
        self.assertEqual(
            detectar_datos_oc(texto, CLIENTES),
            {"numero_oc": "4500012345", "id_cliente": 2, "tipo_operacion_oc": "Internacional", "pais": "argentina"},
        )

    def test_usa_nombre_mas_largo_y_pais_del_cliente(self):
        texto = "OC-PR06-009\nCliente: MINERA LOS ANDES S.A.\nSantiago"
        datos = detectar_datos_oc(texto, CLIENTES)
        self.assertEqual((datos["numero_oc"], datos["id_cliente"], datos["tipo_operacion_oc"]), ("OC-PR06-009", 1, "Nacional"))

    def test_tipo_escrito_en_documento_manda(self):
        texto = "RUT: 76123456-7\nTipo de operación: Internacional"
        self.assertEqual(detectar_datos_oc(texto, CLIENTES)["tipo_operacion_oc"], "Internacional")

    def test_sin_datos_no_inventa(self):
        self.assertEqual(
            detectar_datos_oc("Cotización COT-0046", CLIENTES),
            {"numero_oc": None, "id_cliente": None, "tipo_operacion_oc": None, "pais": None},
        )
