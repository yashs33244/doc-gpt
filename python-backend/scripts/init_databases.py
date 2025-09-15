#!/usr/bin/env python3
"""
Database Initialization Script
Initializes both PostgreSQL and Qdrant databases with proper schemas
and collections for the Doctor GPT application
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.session import db_manager
from app.models import Base
from app.services.qdrant_service import QdrantService

logger = structlog.get_logger(__name__)


async def initialize_postgresql():
    """Initialize PostgreSQL database"""
    logger.info("🔄 Initializing PostgreSQL database...")
    
    try:
        # Test database connection
        engine = create_async_engine(settings.database_url_async)
        
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        
        logger.info("✅ PostgreSQL connection established")
        
        # Create all tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("✅ Database tables created")
        
        # Test basic queries
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT COUNT(*) FROM users"))
            user_count = result.scalar()
            
            result = await conn.execute(text("SELECT COUNT(*) FROM sessions"))
            session_count = result.scalar()
        
        logger.info(f"📊 Database stats:")
        logger.info(f"   - Users: {user_count}")
        logger.info(f"   - Sessions: {session_count}")
        
        await engine.dispose()
        logger.info("✅ PostgreSQL initialization completed")
        
    except Exception as error:
        logger.error("❌ PostgreSQL initialization failed", error=str(error))
        raise error


async def initialize_qdrant():
    """Initialize Qdrant vector database"""
    logger.info("🔄 Initializing Qdrant vector database...")
    
    qdrant = QdrantService()
    
    try:
        # Test connection
        is_healthy = await qdrant.health_check()
        if not is_healthy:
            raise Exception("Qdrant health check failed")
        
        logger.info("✅ Qdrant connection established")
        
        # Initialize collections
        success = await qdrant.initialize_collections()
        if not success:
            raise Exception("Failed to initialize collections")
        
        # Get collection info
        collections_info = await qdrant.get_all_collections_info()
        
        logger.info("📊 Qdrant collections:")
        for name, info in collections_info.items():
            logger.info(f"   - {name}: {info.get('pointsCount', 0)} points, {info.get('vectorsCount', 0)} vectors")
        
        logger.info("✅ Qdrant initialization completed")
        
    except Exception as error:
        logger.error("❌ Qdrant initialization failed", error=str(error))
        raise error


async def create_sample_data():
    """Create sample data for testing"""
    logger.info("🔄 Creating sample data...")
    
    try:
        from app.models import User, Session, SessionStatus, SessionCategory
        from app.db.session import AsyncSessionLocal
        import uuid
        from datetime import datetime
        
        async with AsyncSessionLocal() as db:
            # Create a sample user
            user_id = str(uuid.uuid4())
            user = User(
                id=user_id,
                email="demo@doctorgpt.local",
                name="Demo User"
            )
            db.add(user)
            
            # Create a sample session
            session_id = str(uuid.uuid4())
            session = Session(
                id=session_id,
                user_id=user_id,
                title="Sample Medical Consultation",
                description="A sample session for testing purposes",
                category=SessionCategory.MEDICAL_CONSULTATION,
                tags=["demo", "sample", "medical"],
                status=SessionStatus.ACTIVE,
                last_activity_at=datetime.utcnow().isoformat()
            )
            db.add(session)
            
            await db.commit()
            
            logger.info(f"✅ Sample user created: {user.email}")
            logger.info(f"✅ Sample session created: {session.title}")
        
        # Create sample vector in Qdrant
        qdrant = QdrantService()
        
        # Create dummy vector
        import random
        dummy_vector = [random.random() - 0.5 for _ in range(settings.VECTOR_DIMENSIONS)]
        
        success = await qdrant.store_session_vector(
            session_id=session_id,
            vector=dummy_vector,
            payload={
                "content": "This is a sample medical consultation session for testing vector search capabilities.",
                "title": session.title,
                "userId": user_id,
                "category": session.category.value if session.category else None,
                "tags": session.tags,
                "metadata": {
                    "description": session.description,
                    "createdAt": session.created_at.isoformat()
                }
            }
        )
        
        if success:
            logger.info("✅ Sample vector stored in Qdrant")
        
        logger.info("✅ Sample data creation completed")
        
    except Exception as error:
        logger.error("❌ Sample data creation failed", error=str(error))
        raise error


async def run_health_checks():
    """Run health checks"""
    logger.info("🔄 Running health checks...")
    
    try:
        # PostgreSQL health check
        is_db_healthy = await db_manager.health_check()
        if is_db_healthy:
            logger.info("✅ PostgreSQL health check passed")
        else:
            raise Exception("PostgreSQL health check failed")
        
        # Qdrant health check
        qdrant = QdrantService()
        is_qdrant_healthy = await qdrant.health_check()
        if is_qdrant_healthy:
            logger.info("✅ Qdrant health check passed")
        else:
            raise Exception("Qdrant health check failed")
        
        logger.info("✅ All health checks passed")
        
    except Exception as error:
        logger.error("❌ Health check failed", error=str(error))
        raise error


async def main():
    """Main initialization function"""
    logger.info("🚀 Starting database initialization...")
    logger.info("=====================================")
    
    try:
        await initialize_postgresql()
        logger.info("")
        
        await initialize_qdrant()
        logger.info("")
        
        await create_sample_data()
        logger.info("")
        
        await run_health_checks()
        logger.info("")
        
        logger.info("🎉 Database initialization completed successfully!")
        logger.info("")
        logger.info("📋 Next steps:")
        logger.info("   1. Run: poetry install")
        logger.info("   2. Run: alembic upgrade head")
        logger.info("   3. Start your application: uvicorn app.main:app --reload")
        logger.info("")
        logger.info("🔗 Access points:")
        logger.info("   - FastAPI: http://localhost:8000")
        logger.info("   - PostgreSQL: localhost:5432")
        logger.info("   - Qdrant: http://localhost:6333")
        
    except Exception as error:
        logger.error("💥 Database initialization failed", error=str(error))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

