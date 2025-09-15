"""
Main API router that includes all endpoint routers
"""

from fastapi import APIRouter

from app.api.endpoints import admin, chat, retrieval, upload

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(
    admin.router,
    prefix="/admin",
    tags=["admin"]
)

api_router.include_router(
    chat.router,
    prefix="/chat", 
    tags=["chat"]
)

api_router.include_router(
    retrieval.router,
    prefix="/retrieval",
    tags=["retrieval"]
)

api_router.include_router(
    upload.router,
    prefix="/upload",
    tags=["upload"]
)

