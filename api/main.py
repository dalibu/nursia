import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from api.routers import auth, payments, settings as settings_router, currencies, contributors, admin, users, user_status
from api.middleware.security import SecurityHeadersMiddleware
from api.middleware.logging import SecurityLoggingMiddleware
from config.settings import settings
import os
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

app = FastAPI(
    title="Nursia Payment Tracker API",
    description="REST API для учета платежей",
    version="1.0.0",
    debug=settings.DEBUG
)

# Security middleware
if settings.FORCE_HTTPS:
    app.add_middleware(HTTPSRedirectMiddleware)

if settings.SECURITY_HEADERS_ENABLED:
    app.add_middleware(SecurityHeadersMiddleware)

# Security logging middleware
app.add_middleware(SecurityLoggingMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API роуты с префиксом /api
app.include_router(auth.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(currencies.router, prefix="/api")
app.include_router(contributors.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(user_status.router, prefix="/api")

# React статические файлы
if os.path.exists("frontend/build/static"):
    app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

@app.get("/api")
async def api_root():
    return {"message": "Nursia Payment Tracker API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/health")
async def api_health_check():
    return {"status": "healthy"}

# React SPA - все остальные маршруты
@app.get("/openapi.json", include_in_schema=False)
async def get_open_api_endpoint():
    return get_openapi(title=app.title, version=app.version, routes=app.routes)

@app.get("/docs", include_in_schema=False)
async def swagger_ui_html():
    return get_swagger_ui_html(openapi_url="/openapi.json", title=app.title + " - Swagger UI")

@app.get("/redoc", include_in_schema=False)
async def redoc_ui_html():
    return get_redoc_html(openapi_url="/openapi.json", title=app.title + " - ReDoc")

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    if os.path.exists("frontend/build/index.html"):
        return FileResponse("frontend/build/index.html")
    
    # Если это не API и не статика, и приложения нет - возвращаем сообщение
    return {"message": "React app not built. Run 'npm run build' in frontend directory."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)