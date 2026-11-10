from src.api.routes.auth import router as auth_router
from src.api.routes.underwriting import router as underwriting_router
from src.api.routes.analytics import router as analytics_router
from src.api.routes.system import router as system_router

__all__ = ["auth_router", "underwriting_router", "analytics_router", "system_router"]
