FROM python:3.11-slim

WORKDIR /app

# Install Docker CLI from Debian packages — avoids curl|sh from get.docker.com
RUN apt-get update && apt-get install -y --no-install-recommends \
        docker.io \
        fuse3 \
        libfuse2 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONUNBUFFERED=1

COPY . .

CMD ["python", "app/main.py"]
