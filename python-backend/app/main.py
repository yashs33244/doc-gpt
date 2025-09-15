"""
Main FastAPI application entry point
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_client import make_asgi_app

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import close_db_connection, init_db_connection

# Configure structured logging
configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Doctor GPT Backend", version=app.version)
    
    # Initialize database connections
    await init_db_connection()
    logger.info("Database connections initialized")
    
    # Yield control to the application
    yield
    
    # Shutdown
    logger.info("Shutting down Doctor GPT Backend")
    await close_db_connection()
    logger.info("Database connections closed")


def create_application() -> FastAPI:
    """Create FastAPI application with all configurations"""
    
    app = FastAPI(
        title="Doctor GPT Backend API",
        description="Advanced medical AI assistant with multi-model reasoning, RAG, and healthcare focus",
        version="1.0.0",
        openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings.ENVIRONMENT != "production" else None,
        docs_url=f"{settings.API_V1_STR}/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url=f"{settings.API_V1_STR}/redoc" if settings.ENVIRONMENT != "production" else None,
        lifespan=lifespan
    )

    # Security middleware
    if settings.ALLOWED_HOSTS:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.ALLOWED_HOSTS
        )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    # Add Prometheus metrics endpoint
    if settings.ENABLE_METRICS:
        metrics_app = make_asgi_app()
        app.mount("/metrics", metrics_app)

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint"""
        return {
            "status": "healthy",
            "service": "doctor-gpt-backend",
            "version": app.version,
            "environment": settings.ENVIRONMENT
        }

    # Root endpoint
    @app.get("/")
    async def root():
        """Root endpoint"""
        return {
            "message": "Doctor GPT Backend API",
            "version": app.version,
            "docs_url": f"{settings.API_V1_STR}/docs" if settings.ENVIRONMENT != "production" else None
        }

    return app


# Create the application instance
app = create_application()


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development",
        log_config=None,  # Use our structured logging
    )

