import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from api.routers import auth, expenses, settings, currencies, recipients

app = FastAPI(
    title="Nursia Expense Tracker API",
    description="REST API для учета расходов времени и денег на проживание",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(expenses.router)
app.include_router(settings.router)
app.include_router(currencies.router)
app.include_router(recipients.router)

# Статические файлы
app.mount("/web", StaticFiles(directory="web"), name="web")

@app.get("/")
async def root():
    return {"message": "Nursia Expense Tracker API"}

@app.get("/app")
async def web_app():
    return FileResponse("web/templates/index.html")

@app.get("/mobile")
async def mobile_app():
    return FileResponse("web/templates/mobile.html")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)