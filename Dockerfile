FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy project
COPY . /app/

# Expose port
EXPOSE 8000

# Run migrations at startup, then launch gunicorn.
# Using threads to support SSE (Server-Sent Events) streaming connections.
CMD python manage.py migrate --run-syncdb && \
    gunicorn smart_shop.wsgi:application --bind 0.0.0.0:8000 --workers 3 --threads 2
