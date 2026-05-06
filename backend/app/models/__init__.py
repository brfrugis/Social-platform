# Import models so Alembic and metadata see all tables.
from app.models.customer import Customer  # noqa: F401
from app.models.customer_member import CustomerMember  # noqa: F401
from app.models.news_item import NewsItem  # noqa: F401
from app.models.news_source import NewsSource  # noqa: F401
from app.models.social_connection import SocialConnection  # noqa: F401
from app.models.workspace_token_usage import WorkspaceTokenEvent  # noqa: F401
