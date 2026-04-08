# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies for PostgreSQL and Redis
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the current directory contents into the container at /app
COPY . .

# Install the package itself (to handle setup.py dependencies and package structure)
RUN pip install --no-cache-dir .

# Run database migrations at runtime (DATABASE_URL is set via ENV at startup)
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Define environment variable
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["/start.sh"]
