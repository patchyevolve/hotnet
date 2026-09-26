"""Webhook server — stubbed for now. Implement when backend is ready."""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class WebhookServer:
    """
    HTTP server that receives webhook calls from the backend.

    STUBBED: Routes are defined but do nothing yet.
    When backend is ready, implement these endpoints:
      POST /webhook        — receive job with file references
      GET  /status/{id}    — get job status
      GET  /health         — health check
    """

    def __init__(self, port: int = 8000):
        self.port = port
        logger.info(f"WebhookServer stubbed on port {port}")

    def start(self):
        """Start the webhook server."""
        # TODO: When backend is ready, implement with FastAPI/Flask:
        #
        # from fastapi import FastAPI
        # import uvicorn
        #
        # app = FastAPI()
        #
        # @app.post("/webhook")
        # async def receive_webhook(job_data: dict):
        #     # Create job from webhook data
        #     # Queue it for processing
        #     # Return job_id
        #     pass
        #
        # @app.get("/status/{job_id}")
        # async def get_status(job_id: str):
        #     # Look up job in queue
        #     # Return status
        #     pass
        #
        # @app.get("/health")
        # async def health():
        #     return {"status": "ok"}
        #
        # uvicorn.run(app, host="0.0.0.0", port=self.port)

        logger.warning(
            "WebhookServer is stubbed. "
            "Files are loaded via DirectoryWatcher or CLI instead."
        )

    def stop(self):
        """Stop the webhook server."""
        pass
