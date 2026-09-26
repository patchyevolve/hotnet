# CrimeNet API image.
#
# The application source is *not* copied in. `docker-compose.yml` bind-mounts
# `CriminalNetwork/system` at `/app`, so the container always runs the working
# tree you are editing and the pipeline gets every file it expects
# (`run.py`, `src/`, `loader/`, `db_schema/`, `.env`, case state, uploads).
# This image therefore only supplies the interpreter and the Python
# dependencies from requirements.txt.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# Overridden by the `user:` entry in docker-compose.yml so that files the
# pipeline writes into the bind mount stay owned by your host user.
USER 1000:1000

EXPOSE 8000

CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8000"]
