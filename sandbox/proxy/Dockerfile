FROM python:3.12-slim
COPY proxy.py /opt/proxy.py
USER 65534
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "/opt/proxy.py"]
