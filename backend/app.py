from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.codex import router as codex_router
from .routes.exports import router as exports_router
from .routes.figures import router as figures_router
from .routes.logs import router as logs_router
from .routes.workspace import router as workspace_router
from .runtime import start_runtime, stop_runtime


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    start_runtime()
    try:
        yield
    finally:
        stop_runtime()


app = FastAPI(title="Figure Studio Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workspace_router)
app.include_router(figures_router)
app.include_router(exports_router)
app.include_router(codex_router)
app.include_router(logs_router)
