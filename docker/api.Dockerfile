FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY apps/api/requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip && pip install --no-cache-dir -r /tmp/requirements.txt

COPY apps/api /app
RUN useradd -u 10001 -m appuser && chown -R appuser:appuser /app
USER 10001:10001

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
