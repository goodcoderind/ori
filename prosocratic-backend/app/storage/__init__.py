"""
Storage layer — DynamoDB persistence.

Usage:
    from app.storage import get_storage

    storage = get_storage()
    profile = storage.get_or_create_user(user_id)

The singleton returned by get_storage() is safe to share across requests
within a Lambda invocation (boto3 resource is thread-safe).

For tests, inject a mock resource directly:
    from app.storage.dynamo import DynamoStorage
    storage = DynamoStorage(resource=mock_resource)
"""

from functools import lru_cache

from app.storage.dynamo import DynamoStorage


@lru_cache(maxsize=1)
def get_storage() -> DynamoStorage:
    """Return the application-wide DynamoStorage singleton."""
    return DynamoStorage()
