from enum import StrEnum


class MemberRole(StrEnum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class SocialPlatform(StrEnum):
    LINKEDIN = "linkedin"
    X = "x"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    OTHER = "other"


class ConnectionStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    DISABLED = "disabled"
    ERROR = "error"
