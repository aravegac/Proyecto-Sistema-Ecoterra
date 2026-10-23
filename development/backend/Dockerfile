FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1

# Copiar e instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend
COPY . .

EXPOSE 8444

CMD ["python", "manage.py", "runserver", "0.0.0.0:8444"]