# Import models so Alembic and metadata see all tables.
from app.models.customer import Customer  # noqa: F401
from app.models.customer_member import CustomerMember  # noqa: F401
from app.models.social_connection import SocialConnection  # noqa: F401
