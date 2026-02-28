"""
Minimal MVP authentication via X-User-Id header.

Every protected endpoint declares `user_id: str = Depends(require_user_id)`.

Rules:
  - Header X-User-Id is required.
  - Value must be a valid UUID (any version).  The extension generates a UUID v4
    locally on first install and persists it in chrome.storage.local.

Future: swap this dependency for a JWT / Cognito token verifier without changing
any route signatures.
"""

import uuid

from fastapi import Header, HTTPException


async def require_user_id(
    x_user_id: str = Header(..., alias="X-User-Id", description="Client-generated UUID v4"),
) -> str:
    """
    FastAPI dependency.  Returns the validated user ID string.
    Raises 401 if the header is missing or not a valid UUID.
    """
    try:
        uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="X-User-Id must be a valid UUID (e.g. '550e8400-e29b-41d4-a716-446655440000')",
        )
    return x_user_id
