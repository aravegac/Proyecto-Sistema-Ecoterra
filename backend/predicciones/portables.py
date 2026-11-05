"""Exportación de los árboles aprendidos a JSON, sin dependencias al consultar."""
import json
import struct
from datetime import timedelta
from pathlib import Path

FORMATO = 1

def exportar(modelos, destino):
    from .modelos import BASE
    salida = {"formato": FORMATO, "version": "demo-1", "modelos": {}}
    for tipo, datos in modelos.items():
        vectorizador, bosque = datos["modelo"].steps[0][1], datos["modelo"].steps[1][1]
        arboles = []
        for estimador in bosque.estimators_:
            t = estimador.tree_
            arboles.append({"izquierda": t.children_left.tolist(), "derecha": t.children_right.tolist(),
                           "variable": t.feature.tolist(), "umbral": t.threshold.tolist(),
                           "valor": t.value[:,0,0].tolist()})
        salida["modelos"][tipo] = {k:v for k,v in datos.items() if k != "modelo"}
        salida["modelos"][tipo].update(variables=vectorizador.get_feature_names_out().tolist(), arboles=arboles)
        if tipo == "precio":
            salida["modelos"][tipo]["fecha_fin_entrenamiento"] = (BASE + timedelta(days=datos["entrenamiento"]-1)).isoformat()
    destino = Path(destino)
    temporal = destino.with_suffix(".json.tmp")
    temporal.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    temporal.replace(destino)

class BosquePortable:
    def __init__(self, datos):
        self.variables = datos["variables"]
        self.arboles = datos["arboles"]
        if not self.arboles:
            raise ValueError("Modelo sin árboles")

    def predict(self, filas):
        resultados = []
        for fila in filas:
            valores = {}
            for clave, valor in fila.items():
                if isinstance(valor, str): valores[clave + "=" + valor] = 1.0
                else: valores[clave] = float(valor)
            # Scikit-Learn evalúa sus árboles con entradas float32.
            vector = [struct.unpack("f", struct.pack("f", valores.get(nombre, 0.0)))[0] for nombre in self.variables]
            total = 0.0
            for arbol in self.arboles:
                nodo = 0
                while arbol["izquierda"][nodo] != -1:
                    nodo = arbol["izquierda"][nodo] if vector[arbol["variable"][nodo]] <= arbol["umbral"][nodo] else arbol["derecha"][nodo]
                total += arbol["valor"][nodo]
            resultados.append(total / len(self.arboles))
        return resultados

def leer(ruta):
    documento = json.loads(Path(ruta).read_text(encoding="utf-8"))
    if documento["formato"] != FORMATO:
        raise ValueError("Formato de modelo incompatible")
    modelos = documento["modelos"]
    for datos in modelos.values(): datos["modelo"] = BosquePortable(datos)
    return modelos
