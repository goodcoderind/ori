"""
Tests for GET /health.

Covers:
  - 200 response with correct shape
  - X-Request-Id header echoed back
  - Custom X-Request-Id preserved
  - Response does not require authentication
"""

import uuid


class TestHealthEndpoint:
    def test_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_body_shape(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "environment" in data

    def test_environment_is_test(self, client):
        data = client.get("/health").json()
        assert data["environment"] == "test"

    def test_response_header_contains_request_id(self, client):
        response = client.get("/health")
        assert "X-Request-Id" in response.headers

    def test_auto_generated_request_id_is_uuid(self, client):
        response = client.get("/health")
        rid = response.headers["X-Request-Id"]
        # Should not raise
        uuid.UUID(rid)

    def test_custom_request_id_is_echoed(self, client):
        custom_id = "my-trace-id-abc123"
        response = client.get("/health", headers={"X-Request-Id": custom_id})
        assert response.headers["X-Request-Id"] == custom_id

    def test_no_auth_required(self, client):
        """Health endpoint must be reachable without X-User-Id."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_cors_header_present_with_dashboard_origin(self, client):
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:3000"},
        )
        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers


class TestErrorFormat:
    """Verify the standard error envelope for common error cases."""

    def test_404_has_error_envelope(self, client):
        response = client.get("/nonexistent-route")
        assert response.status_code == 404
        body = response.json()
        assert "error" in body
        assert "code" in body["error"]
        assert "message" in body["error"]
        assert "request_id" in body["error"]

    def test_404_error_code_format(self, client):
        response = client.get("/nonexistent-route")
        assert response.json()["error"]["code"] == "HTTP_404"

    def test_request_id_in_error_matches_header(self, client):
        custom_id = "error-trace-xyz"
        response = client.get(
            "/nonexistent-route",
            headers={"X-Request-Id": custom_id},
        )
        assert response.json()["error"]["request_id"] == custom_id
