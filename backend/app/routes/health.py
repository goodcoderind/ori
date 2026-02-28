"""
GET /health — liveness probe.

Returns HTTP 200 with a minimal JSON payload.  No auth required so that AWS
Lambda health checks, ALB target-group checks, and local smoke-tests all work
without credentials.
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(tags=["system"])
logger = logging.getLogger("prosocratic.health")


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    description="Returns `ok` when the service is running. No authentication required.",
)
async def health(request: Request) -> HealthResponse:
    settings = get_settings()
    logger.debug("Health check", extra={"path": request.url.path})
    return HealthResponse(
        status="ok",
        version=settings.api_version,
        environment=settings.environment,
    )
