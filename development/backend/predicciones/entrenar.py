"""Ejecutar desde la raíz: .venv\\Scripts\\python.exe backend/predicciones/entrenar.py"""
import json
import os
import tempfile
from pathlib import Path
import joblib
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from predicciones.modelos import entrenar
from predicciones.portables import exportar

if __name__ == "__main__":
    destino = Path(__file__).parent / "artefactos"
    destino.mkdir(exist_ok=True)
    modelos = entrenar(destino.parent / "datos")
    # Publicación atómica: las consultas no leen archivos incompletos.
    with tempfile.NamedTemporaryFile(dir=destino, suffix=".joblib", delete=False) as f:
        temporal = f.name
    joblib.dump(modelos, temporal)
    os.replace(temporal, destino / "modelos.joblib")
    exportar(modelos, destino / "modelos.json")
    reporte = {k: {a:b for a,b in v.items() if a != "modelo"} for k,v in modelos.items()}
    (destino / "metricas.json").write_text(json.dumps(reporte, indent=2))
    print(json.dumps(reporte, indent=2))
