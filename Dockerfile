FROM node:20-slim AS frontend-build

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build


FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY --from=frontend-build /frontend/dist ./frontend/dist

# Hugging Face Spaces (Docker SDK) expects the app on port 7860
# and writes to /data if you attach persistent storage.
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
