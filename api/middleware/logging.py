import logging
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from config.settings import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger("nursia.security")


class SecurityLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Log security-relevant requests
        if request.url.path.startswith("/api/auth/"):
            client_ip = request.client.host if request.client else "unknown"
            logger.info(f"Auth request: {request.method} {request.url.path} from {client_ip}")
        
        response = await call_next(request)
        
        # Log failed authentication attempts
        if request.url.path.startswith("/api/auth/login") and response.status_code == 401:
            client_ip = request.client.host if request.client else "unknown"
            logger.warning(f"Failed login attempt from {client_ip}")
        
        # Log admin actions
        if (request.url.path.startswith("/api/admin/") or 
            request.url.path.startswith("/api/expenses/categories") and request.method in ["POST", "PUT", "DELETE"]):
            if response.status_code < 400:
                client_ip = request.client.host if request.client else "unknown"
                logger.info(f"Admin action: {request.method} {request.url.path} from {client_ip}")
        
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        
        return response