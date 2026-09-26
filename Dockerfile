# Multi-stage / lightweight Python 3.11 image for Secretary AI
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    PORT=8000 \
    HOST=0.0.0.0

# Install required system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code and frontend
COPY app/ /app/app/
COPY frontend/ /app/frontend/
COPY docs/ /app/docs/

# Create persistent storage and backup directories
RUN mkdir -p /data /app/backups

# Expose server port
EXPOSE 8000

# Health check to monitor container status
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Start Uvicorn application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
