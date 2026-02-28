"""
DynamoDB persistence layer for ProSocratic.

Tables (names from env):
  TABLE_USERS       — UserProfile   (PK: user_id)
  TABLE_SESSIONS    — SessionRecord (PK: user_id, SK: session_id)
  TABLE_ASSESSMENTS — ProbeSet      (PK: user_id, SK: probe_set_id)

Design decisions:
  - Uses boto3 *resource* (higher-level) — type conversion is handled automatically.
  - Floats → Decimal before storage; Decimal → float on read (DynamoDB requirement).
  - Datetimes → ISO 8601 strings via pydantic model_dump_json(); parsed back by pydantic.
  - None-valued fields are excluded from stored items to save space and avoid
    DynamoDB NULL type complications.
  - Sessions and Assessments carry an `expires_at` Unix timestamp for TTL.
  - All read-modify-write operations (update_mastery, update_technique_stats,
    append_session_event) fetch the current item, mutate in Python, then PutItem.
    Acceptable for single-user access patterns; upgrade to conditional writes if
    concurrent writes become a concern.

PRIVACY GUARANTEED BY SCHEMA:
  - No `page_context` or `answer_text` field exists on any stored model.
  - Only derived scores, error types, and timestamps are written to Assessments.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from app.config import get_settings
from app.models import (
    AttemptMeta,
    MasteryItem,
    ProbeSet,
    RolledUpSummary,
    SessionEvent,
    SessionRecord,
    TechniqueStatsEntry,
    UserProfile,
)

logger = logging.getLogger("prosocratic.storage")

# ── Decimal helpers ────────────────────────────────────────────────────────────


def _to_decimal(obj: Any) -> Any:
    """Recursively convert float → Decimal for DynamoDB storage."""
    if isinstance(obj, float):
        try:
            return Decimal(str(obj))
        except InvalidOperation:
            return Decimal("0")
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(v) for v in obj]
    return obj


def _from_decimal(obj: Any) -> Any:
    """Recursively convert Decimal → float/int for pydantic parsing."""
    if isinstance(obj, Decimal):
        f = float(obj)
        return int(f) if f == int(f) else f
    if isinstance(obj, dict):
        return {k: _from_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_decimal(v) for v in obj]
    return obj


# DynamoDB-only attributes added at write time (TTL, version counters).
# These must be stripped before passing items to pydantic models that
# use extra="forbid" (e.g. ProbeSet), otherwise validation fails.
_DYNAMO_META: frozenset[str] = frozenset({"expires_at"})


def _strip_meta(item: dict) -> dict:
    """Remove DynamoDB-internal fields from a raw item before model validation."""
    return {k: v for k, v in item.items() if k not in _DYNAMO_META}


# ── Serialisation helpers ──────────────────────────────────────────────────────


def _model_to_item(model: Any) -> dict:
    """
    Serialise a pydantic model to a DynamoDB-safe dict.
    - None fields are excluded (saves space, avoids NULL type issues).
    - Floats are converted to Decimal.
    - Datetimes are serialised as ISO 8601 strings by pydantic.
    """
    raw: dict = json.loads(model.model_dump_json(exclude_none=True))
    return _to_decimal(raw)


def _ttl() -> int:
    """Unix timestamp SESSION_TTL_DAYS from now."""
    settings = get_settings()
    return int((datetime.now(UTC) + timedelta(days=settings.session_ttl_days)).timestamp())


# ── DynamoStorage ──────────────────────────────────────────────────────────────


class DynamoStorage:
    """
    All DynamoDB CRUD for ProSocratic.

    Inject a mock/stub boto3 resource in tests:
        storage = DynamoStorage(resource=mock_resource)
    """

    def __init__(self, resource: Any = None) -> None:
        if resource is None:
            resource = self._build_resource()
        self._resource = resource

    @staticmethod
    def _build_resource() -> Any:
        settings = get_settings()
        kwargs: dict[str, Any] = {"region_name": settings.aws_region}
        if settings.aws_access_key_id:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        return boto3.resource("dynamodb", **kwargs)

    # ── Table accessors ────────────────────────────────────────────────────────

    def _table(self, name: str) -> Any:
        return self._resource.Table(name)

    def _users(self) -> Any:
        return self._table(get_settings().table_users)

    def _sessions(self) -> Any:
        return self._table(get_settings().table_sessions)

    def _assessments(self) -> Any:
        return self._table(get_settings().table_assessments)

    # ── Private put helpers ────────────────────────────────────────────────────

    def _put_user(self, profile: UserProfile) -> None:
        self._users().put_item(Item=_model_to_item(profile))

    def _put_session(self, record: SessionRecord) -> None:
        item = _model_to_item(record)
        item["expires_at"] = _ttl()
        self._sessions().put_item(Item=item)

    def _put_assessment(self, probe_set: ProbeSet) -> None:
        item = _model_to_item(probe_set)
        item["expires_at"] = _ttl()
        self._assessments().put_item(Item=item)

    # ── User operations ────────────────────────────────────────────────────────

    def get_or_create_user(self, user_id: str) -> UserProfile:
        """
        Fetch the user profile from TABLE_USERS.
        If no record exists, create and persist a fresh profile.
        """
        response = self._users().get_item(Key={"user_id": user_id})
        item = response.get("Item")

        if item:
            return UserProfile.model_validate(_from_decimal(item))

        profile = UserProfile(user_id=user_id)
        self._put_user(profile)
        logger.info({"event": "user_created", "user_id": user_id})
        return profile

    # ── Session operations ─────────────────────────────────────────────────────

    def create_session(
        self,
        user_id: str,
        url: str,
        title: str,
        topic_label: str | None = None,
    ) -> SessionRecord:
        """
        Create and persist a new SessionRecord.
        Returns the record with its auto-generated session_id.
        """
        record = SessionRecord(
            user_id=user_id,
            topic_label=topic_label,
        )
        self._put_session(record)
        logger.info(
            {
                "event": "session_created",
                "user_id": user_id,
                "session_id": record.session_id,
            }
        )
        return record

    def get_session(self, user_id: str, session_id: str) -> SessionRecord | None:
        """Fetch a full SessionRecord including all events."""
        response = self._sessions().get_item(
            Key={"user_id": user_id, "session_id": session_id}
        )
        item = response.get("Item")
        if not item:
            return None
        return SessionRecord.model_validate(_from_decimal(item))

    def append_session_event(
        self, user_id: str, session_id: str, event: SessionEvent
    ) -> SessionRecord:
        """
        Append a SessionEvent to the session's events list.
        Applies the bounded-list rollup if len(events) > MAX_EVENTS.

        Uses read-modify-write (acceptable for single-user write patterns).
        """
        record = self.get_session(user_id, session_id)
        if record is None:
            raise ValueError(f"Session {session_id!r} not found for user {user_id!r}")

        record.append_event(event)  # rollup handled inside SessionRecord
        self._put_session(record)
        return record

    def set_session_flags(
        self,
        user_id: str,
        session_id: str,
        ignore_count: int,
        asleep_flag: bool,
    ) -> None:
        """
        Atomic update of ignore_count and asleep_flag via UpdateItem.
        Does not require a full read-modify-write.
        """
        self._sessions().update_item(
            Key={"user_id": user_id, "session_id": session_id},
            UpdateExpression="SET ignore_count = :ic, asleep_flag = :af",
            ExpressionAttributeValues={
                ":ic": ignore_count,
                ":af": asleep_flag,
            },
        )

    def end_session(self, user_id: str, session_id: str) -> None:
        """Set ended_at on the session record via atomic UpdateItem."""
        self._sessions().update_item(
            Key={"user_id": user_id, "session_id": session_id},
            UpdateExpression="SET ended_at = :ts",
            ExpressionAttributeValues={":ts": datetime.now(UTC).isoformat()},
        )

    def list_sessions(self, user_id: str, limit: int = 20) -> list[SessionRecord]:
        """
        Return recent sessions for a user, most recent first.
        Events are excluded from the projection to keep response size small.
        """
        response = self._sessions().query(
            KeyConditionExpression=Key("user_id").eq(user_id),
            # Exclude the potentially large events list for listing purposes.
            ProjectionExpression=(
                "user_id, session_id, started_at, ended_at, topic_label, "
                "ignore_count, asleep_flag, microassess_ids, rolled_up_summary"
            ),
        )
        items = [_from_decimal(item) for item in response.get("Items", [])]

        # Sort by started_at descending in Python (SK is session_id UUID, not time-sortable).
        items.sort(key=lambda x: x.get("started_at", ""), reverse=True)
        items = items[:limit]

        return [SessionRecord.model_validate(item) for item in items]

    # ── Assessment operations ──────────────────────────────────────────────────

    def save_probe_set(self, probe_set: ProbeSet) -> ProbeSet:
        """
        Persist a new ProbeSet to TABLE_ASSESSMENTS.
        probe_set_id is auto-generated if not provided.
        """
        self._put_assessment(probe_set)
        logger.info(
            {
                "event": "probe_set_saved",
                "user_id": probe_set.user_id,
                "probe_set_id": probe_set.probe_set_id,
            }
        )
        return probe_set

    def append_probe_attempt_meta(
        self,
        user_id: str,
        probe_set_id: str,
        attempt_meta: AttemptMeta,
    ) -> None:
        """
        Atomically append an AttemptMeta to the probe set's attempts_meta list.

        PRIVACY: Only derived score + error_type are stored. The raw answer_text
        is never passed to or stored by this function.
        """
        attempt_item = _to_decimal(
            json.loads(attempt_meta.model_dump_json(exclude_none=True))
        )
        self._assessments().update_item(
            Key={"user_id": user_id, "probe_set_id": probe_set_id},
            UpdateExpression=(
                "SET attempts_meta = list_append("
                "if_not_exists(attempts_meta, :empty), :new_attempt)"
            ),
            ExpressionAttributeValues={
                ":new_attempt": [attempt_item],
                ":empty": [],
            },
        )

    # ── Profile update operations ──────────────────────────────────────────────

    def update_mastery(
        self,
        user_id: str,
        topic_label: str,
        mastery_item: MasteryItem,
    ) -> UserProfile:
        """
        Update (or create) the mastery entry for a topic on the user profile.
        Read-modify-write on TABLE_USERS.
        """
        profile = self.get_or_create_user(user_id)
        profile.mastery_by_topic[topic_label] = mastery_item
        self._put_user(profile)
        return profile

    def update_technique_stats(
        self,
        user_id: str,
        technique_id: str,
        shown_delta: int = 0,
        accepted_delta: int = 0,
        success_delta: int = 0,
        reward_delta: float = 0.0,
    ) -> UserProfile:
        """
        Increment technique stats counters for the given technique.
        Creates a new entry if the technique_id is not yet known.
        Read-modify-write on TABLE_USERS.
        """
        profile = self.get_or_create_user(user_id)

        if technique_id not in profile.technique_stats:
            profile.technique_stats[technique_id] = TechniqueStatsEntry()

        stats = profile.technique_stats[technique_id]
        stats.shown_count += shown_delta
        stats.accepted_count += accepted_delta
        stats.success_count += success_delta
        stats.reward_sum += reward_delta

        self._put_user(profile)
        return profile

    # ── Dashboard ──────────────────────────────────────────────────────────────

    def dashboard_summary(self, user_id: str) -> dict:
        """
        Aggregate read for the /profiles/{user_id} dashboard endpoint.

        Returns:
          - modality_pref
          - top 5 techniques by success_rate (ties broken by acceptance_rate)
          - mastery_by_topic with p_mastery and next_probe_at
          - recent sessions metadata (last 10, no events)
        """
        profile = self.get_or_create_user(user_id)
        recent_sessions = self.list_sessions(user_id, limit=10)

        top_techniques = sorted(
            [
                {
                    "technique_id": tid,
                    "shown_count": stats.shown_count,
                    "acceptance_rate": round(stats.acceptance_rate, 3),
                    "success_rate": round(stats.success_rate, 3),
                    "reward_sum": round(stats.reward_sum, 4),
                }
                for tid, stats in profile.technique_stats.items()
                if stats.shown_count > 0
            ],
            key=lambda x: (x["success_rate"], x["acceptance_rate"]),
            reverse=True,
        )[:5]

        return {
            "user_id": user_id,
            "created_at": profile.created_at.isoformat(),
            "modality_pref": profile.modality_pref,
            "top_techniques": top_techniques,
            "mastery_by_topic": {
                topic: {
                    "p_mastery": round(item.p_mastery, 4),
                    "next_probe_at": item.next_probe_at.isoformat()
                    if item.next_probe_at
                    else None,
                }
                for topic, item in profile.mastery_by_topic.items()
            },
            "recent_sessions": [
                {
                    "session_id": s.session_id,
                    "started_at": s.started_at.isoformat(),
                    "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                    "topic_label": s.topic_label,
                    "total_events": s.total_event_count,
                }
                for s in recent_sessions
            ],
        }
