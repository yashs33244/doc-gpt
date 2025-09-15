"""
Database session management and connection handling
"""

from typing import AsyncGenerator, Optional

import structlog
from sqlalchemy import create_engine, pool, text

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

logger = structlog.get_logger(__name__)

# Synchronous engine for migrations and scripts
sync_engine = create_engine(
    settings.database_url_sync,
    poolclass=pool.NullPool if settings.is_development else pool.QueuePool,
    pool_pre_ping=True,
    echo=settings.DEBUG_MODE and settings.is_development,
)

# Asynchronous engine for API operations
async_engine = create_async_engine(
    settings.database_url_async,
    poolclass=pool.NullPool if settings.is_development else pool.AsyncAdaptedQueuePool,
    pool_pre_ping=True,
    echo=settings.DEBUG_MODE and settings.is_development,
)

# Session factories
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False
)


async def init_db_connection() -> None:
    """Initialize database connections"""
    try:
        # Test the connection
        async with async_engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database connection", error=str(e))
        raise


async def close_db_connection() -> None:
    """Close database connections"""
    try:
        await async_engine.dispose()
        sync_engine.dispose()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error("Error closing database connections", error=str(e))


def get_db() -> Session:
    """Get synchronous database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Get asynchronous database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


class DatabaseManager:
    """Database connection manager with context handling"""
    
    def __init__(self):
        self._async_engine = async_engine
        self._sync_engine = sync_engine
    
    @property
    def async_engine(self):
        """Get async engine"""
        return self._async_engine
    
    @property
    def sync_engine(self):
        """Get sync engine"""
        return self._sync_engine
    
    async def get_session(self) -> AsyncSession:
        """Get async session"""
        return AsyncSessionLocal()
    
    def get_sync_session(self) -> Session:
        """Get sync session"""
        return SessionLocal()
    
    async def health_check(self) -> bool:
        """Check database health"""
        try:
            async with self._async_engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            return False


# Global database manager instance
db_manager = DatabaseManager()
