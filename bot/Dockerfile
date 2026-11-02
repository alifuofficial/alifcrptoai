# ==============================================================================
# alifcrptoai - Autonomous Crypto Trading Bot Dockerfile
# Optimized for Contabo VPS (6 vCPU, 12GB RAM) on CapRover
# Author & Developer: Alifu Haji
# ==============================================================================

FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TZ=UTC

WORKDIR /app

# Install minimal OS dependencies for network operations & compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy bot application files
COPY . .

EXPOSE 80

# Run bot in unbuffered mode
CMD ["python", "-u", "bot.py"]
