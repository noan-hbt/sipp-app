FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# SERVICE_ROLE=api (default) or worker. Same image for both Railway services.
CMD ["sh", "start.sh"]
