FROM mcr.microsoft.com/playwright/python:v1.49.0-noble
RUN pip install --no-cache-dir --break-system-packages playwright==1.49.0
RUN useradd -m -u 10001 scout
COPY worker.py /opt/worker.py
USER scout
ENV HOME=/tmp PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "/opt/worker.py"]
