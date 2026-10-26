import re

from django.contrib.auth.models import User
from rest_framework import serializers
from .branches import MAX_PROJECT_DATA_BYTES, clean_data
from .models import Project, Feedback, FeedbackReply

# SHA-256 hex digest: exactly 64 lowercase hex characters
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")

# Strip HTML tags from project names
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")


def sanitize_name(value: str) -> str:
    """Remove HTML tags and excessive whitespace from project names."""
    cleaned = HTML_TAG_PATTERN.sub("", value).strip()
    if not cleaned:
        return "Untitled Project"
    return cleaned


class ProjectListSerializer(serializers.ModelSerializer):
    """A project in the user's list, previewed by the branch last worked on."""
    fork_count = serializers.IntegerField(source="forks.count", read_only=True)
    preview_data = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "edit_uuid",
            "view_uuid",
            "name",
            "description",
            "fork_of",
            "fork_count",
            "created_at",
            "updated_at",
            "preview_data",
        ]
        read_only_fields = fields

    @staticmethod
    def _design(obj):
        branch = obj.active_branch or obj.main_branch
        return (branch.data if branch else None) or {}

    def get_description(self, obj):
        """The project's one-line description, which lives in the project JSON."""
        value = self._design(obj).get("description")
        return value[:200] if isinstance(value, str) else ""

    def get_preview_data(self, obj):
        """Extract minimal data needed for stripboard preview thumbnail."""
        data = self._design(obj)
        components = data.get("components", [])
        # An off-board part is on the board as its solder pads, kept in "leads"
        placed = [
            c for c in components
            if c.get("boardPos") is not None or (c.get("offBoard") and c.get("leads"))
        ]
        if not placed:
            return None
        return {
            "components": placed,
            "componentDefs": data.get("componentDefs", []),
            "board": data.get("board", {}),
            "nets": data.get("nets", []),
            "netAssignments": data.get("netAssignments", []),
        }


class ProjectCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, default="Untitled Project")
    data = serializers.JSONField()

    def validate_name(self, value):
        return sanitize_name(value)

    def validate_data(self, value):
        return clean_data(value)


class LayoutRatingCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    snapshot = serializers.JSONField()
    metrics = serializers.JSONField(required=False, default=dict)
    solver_version = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    project_edit_uuid = serializers.UUIDField(required=False, allow_null=True)

    def validate_snapshot(self, value):
        import json
        size = len(json.dumps(value).encode("utf-8"))
        if size > MAX_PROJECT_DATA_BYTES:
            raise serializers.ValidationError(
                f"Snapshot too large ({size} bytes). Maximum is {MAX_PROJECT_DATA_BYTES} bytes."
            )
        return value


class UserRegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    # Optional: enables password reset later. Not verified.
    email = serializers.EmailField(required=False, allow_blank=True, default="")

    def validate_username(self, value):
        value = value.lower()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def validate_password(self, value):
        if not SHA256_PATTERN.match(value):
            raise serializers.ValidationError("Invalid credentials.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        # Enforce uniqueness at the app layer (Django's User.email isn't unique).
        # Blank is exempt: any number of accounts may have no recovery email.
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value


class EmailUpdateSerializer(serializers.Serializer):
    # Blank clears the address (opting out of password reset).
    email = serializers.EmailField(required=False, allow_blank=True, default="")

    def validate_email(self, value):
        value = value.strip().lower()
        if value:
            qs = User.objects.filter(email__iexact=value)
            # Allow re-saving the caller's own address unchanged.
            user = self.context.get("user")
            if user is not None:
                qs = qs.exclude(pk=user.pk)
            if qs.exists():
                raise serializers.ValidationError("This email is already in use.")
        return value


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate_username(self, value):
        return value.lower()

    def validate_password(self, value):
        if not SHA256_PATTERN.match(value):
            raise serializers.ValidationError("Invalid credentials.")
        return value


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "date_joined", "is_staff"]
        read_only_fields = fields


class FeedbackCreateSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=4000, trim_whitespace=True)
    contact = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )


class FeedbackReplySerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedbackReply
        fields = ["body", "from_staff", "created_at"]
        read_only_fields = fields


class FeedbackThreadSerializer(serializers.ModelSerializer):
    replies = FeedbackReplySerializer(many=True, read_only=True)

    class Meta:
        model = Feedback
        fields = ["id", "message", "created_at", "replies"]
        read_only_fields = fields


class FeedbackReplyCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000, trim_whitespace=True)


# ── Staff-side feedback (the /inbox page) ──────────────

class AdminThreadListSerializer(serializers.ModelSerializer):
    """One row in the staff inbox list. Relies on last_activity/last_user_msg
    annotations added by the view."""
    username = serializers.CharField(source="user.username", default=None, read_only=True)
    reply_count = serializers.IntegerField(read_only=True)  # annotated in the view
    last_activity = serializers.DateTimeField(read_only=True)
    unseen = serializers.SerializerMethodField()

    class Meta:
        model = Feedback
        fields = [
            "id", "username", "contact", "message",
            "created_at", "last_activity", "reply_count", "unseen",
        ]
        read_only_fields = fields

    def get_unseen(self, obj):
        return obj.staff_last_seen is None or obj.last_user_msg > obj.staff_last_seen


class AdminThreadDetailSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", default=None, read_only=True)
    replies = FeedbackReplySerializer(many=True, read_only=True)

    class Meta:
        model = Feedback
        fields = ["id", "username", "contact", "message", "created_at", "replies"]
        read_only_fields = fields
