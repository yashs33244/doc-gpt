#!/usr/bin/env python3
"""
Create Test User Script
Creates a test user and session for comprehensive API testing
"""

import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

import structlog
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import User, Session, SessionStatus, SessionCategory, Chat, MessageRole

logger = structlog.get_logger(__name__)

class TestUserManager:
    """Manages test user creation and cleanup"""
    
    def __init__(self):
        self.test_user_id = "550e8400-e29b-41d4-a716-446655440000"  # Fixed UUID for testing
        self.test_session_id = "550e8400-e29b-41d4-a716-446655440001"  # Fixed UUID for testing
        self.test_email = "test@doctorgpt.local"
        
    async def create_test_user(self) -> dict:
        """Create or update test user"""
        async with AsyncSessionLocal() as db:
            try:
                # Check if user exists
                existing_user = await db.get(User, self.test_user_id)
                
                if existing_user:
                    logger.info("Test user already exists", user_id=self.test_user_id, email=existing_user.email)
                    user = existing_user
                else:
                    # Create new test user
                    user = User(
                        id=self.test_user_id,
                        email=self.test_email,
                        name="Test User - Doctor GPT"
                    )
                    db.add(user)
                    await db.commit()
                    await db.refresh(user)
                    logger.info("✅ Created test user", user_id=user.id, email=user.email)
                
                return {
                    "id": str(user.id),
                    "email": user.email,
                    "name": user.name,
                    "created_at": user.created_at.isoformat() if user.created_at else None
                }
                
            except Exception as e:
                logger.error("❌ Failed to create test user", error=str(e))
                raise
    
    async def create_test_session(self) -> dict:
        """Create or update test session"""
        async with AsyncSessionLocal() as db:
            try:
                # Check if session exists
                existing_session = await db.get(Session, self.test_session_id)
                
                if existing_session:
                    logger.info("Test session already exists", session_id=self.test_session_id, title=existing_session.title)
                    session = existing_session
                else:
                    # Create new test session
                    session = Session(
                        id=self.test_session_id,
                        user_id=self.test_user_id,
                        title="Test Medical Consultation Session",
                        description="A comprehensive test session for API testing and validation",
                        category=SessionCategory.MEDICAL_CONSULTATION,
                        tags=["test", "api", "medical", "consultation"],
                        status=SessionStatus.ACTIVE,
                        is_active=True,
                        last_activity_at=datetime.utcnow().isoformat()
                    )
                    db.add(session)
                    await db.commit()
                    await db.refresh(session)
                    logger.info("✅ Created test session", session_id=session.id, title=session.title)
                
                return {
                    "id": str(session.id),
                    "user_id": str(session.user_id),
                    "title": session.title,
                    "description": session.description,
                    "status": session.status.value if session.status else None,
                    "created_at": session.created_at.isoformat() if session.created_at else None
                }
                
            except Exception as e:
                logger.error("❌ Failed to create test session", error=str(e))
                raise
    
    async def create_sample_chat_data(self) -> list:
        """Create sample chat messages for testing"""
        async with AsyncSessionLocal() as db:
            try:
                # Create sample user message
                user_message = Chat(
                    id=str(uuid.uuid4()),
                    session_id=self.test_session_id,
                    user_id=self.test_user_id,
                    role=MessageRole.USER,
                    content="Hello, I've been experiencing chest pain for the past two days. What could be causing this?",
                    is_healthcare_query=True,
                    metadata={
                        "test": True,
                        "timestamp": datetime.utcnow().isoformat(),
                        "messageType": "initial_query"
                    }
                )
                
                # Create sample assistant response
                assistant_message = Chat(
                    id=str(uuid.uuid4()),
                    session_id=self.test_session_id,
                    user_id=self.test_user_id,
                    role=MessageRole.ASSISTANT,
                    content="I understand your concern about chest pain. This is a symptom that should be taken seriously. Chest pain can have various causes including cardiac, respiratory, gastrointestinal, or musculoskeletal issues. Given that you've been experiencing this for two days, I strongly recommend seeking immediate medical attention, especially if the pain is severe, radiating to your arm or jaw, or accompanied by shortness of breath.",
                    is_healthcare_query=True,
                    confidence=0.85,
                    citations=[],
                    metadata={
                        "test": True,
                        "timestamp": datetime.utcnow().isoformat(),
                        "messageType": "medical_advice",
                        "modelProvider": "test",
                        "responseTime": 1500
                    }
                )
                
                db.add(user_message)
                db.add(assistant_message)
                await db.commit()
                
                logger.info("✅ Created sample chat messages")
                
                return [
                    {
                        "id": str(user_message.id),
                        "role": user_message.role.value,
                        "content": user_message.content
                    },
                    {
                        "id": str(assistant_message.id),
                        "role": assistant_message.role.value,
                        "content": assistant_message.content,
                        "confidence": assistant_message.confidence
                    }
                ]
                
            except Exception as e:
                logger.error("❌ Failed to create sample chat data", error=str(e))
                raise
    
    async def verify_database_setup(self) -> dict:
        """Verify database setup and return statistics"""
        async with AsyncSessionLocal() as db:
            try:
                from sqlalchemy import text
                
                # Get table counts
                tables = ["users", "sessions", "chats", "cost_logs", "medical_reports"]
                stats = {}
                
                for table in tables:
                    result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = result.scalar()
                    stats[table] = count
                
                logger.info("📊 Database statistics", **stats)
                return stats
                
            except Exception as e:
                logger.error("❌ Failed to verify database setup", error=str(e))
                raise
    
    async def cleanup_test_data(self) -> None:
        """Clean up test data (optional)"""
        async with AsyncSessionLocal() as db:
            try:
                from sqlalchemy import text
                
                # Delete test data in reverse order of dependencies
                tables_and_conditions = [
                    ("cost_logs", f"user_id = '{self.test_user_id}'"),
                    ("chats", f"user_id = '{self.test_user_id}'"),
                    ("sessions", f"user_id = '{self.test_user_id}'"),
                    ("users", f"id = '{self.test_user_id}'")
                ]
                
                for table, condition in tables_and_conditions:
                    result = await db.execute(text(f"DELETE FROM {table} WHERE {condition}"))
                    deleted_count = result.rowcount
                    if deleted_count > 0:
                        logger.info(f"Deleted {deleted_count} records from {table}")
                
                await db.commit()
                logger.info("✅ Test data cleanup completed")
                
            except Exception as e:
                logger.error("❌ Failed to cleanup test data", error=str(e))
                raise
    
    async def setup_complete_test_environment(self) -> dict:
        """Set up complete test environment"""
        logger.info("🚀 Setting up complete test environment...")
        
        try:
            # Verify database
            db_stats = await self.verify_database_setup()
            
            # Create test user
            user_info = await self.create_test_user()
            
            # Create test session
            session_info = await self.create_test_session()
            
            # Create sample chat data
            chat_messages = await self.create_sample_chat_data()
            
            # Final verification
            final_stats = await self.verify_database_setup()
            
            result = {
                "success": True,
                "test_user": user_info,
                "test_session": session_info,
                "sample_messages": len(chat_messages),
                "database_stats": final_stats,
                "test_credentials": {
                    "user_id": self.test_user_id,
                    "session_id": self.test_session_id,
                    "email": self.test_email
                }
            }
            
            logger.info("🎉 Test environment setup completed successfully!")
            logger.info(f"📋 Test User ID: {self.test_user_id}")
            logger.info(f"📋 Test Session ID: {self.test_session_id}")
            logger.info(f"📋 Test Email: {self.test_email}")
            
            return result
            
        except Exception as e:
            logger.error("💥 Test environment setup failed", error=str(e))
            raise


async def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Manage test user for Doctor GPT")
    parser.add_argument("--action", choices=["create", "cleanup", "verify"], 
                       default="create", help="Action to perform")
    parser.add_argument("--cleanup", action="store_true", 
                       help="Clean up test data after creation")
    
    args = parser.parse_args()
    
    manager = TestUserManager()
    
    try:
        if args.action == "create":
            result = await manager.setup_complete_test_environment()
            print(f"\n{'='*60}")
            print("TEST ENVIRONMENT READY")
            print(f"{'='*60}")
            print(f"User ID: {result['test_credentials']['user_id']}")
            print(f"Session ID: {result['test_credentials']['session_id']}")
            print(f"Email: {result['test_credentials']['email']}")
            print(f"{'='*60}")
            
            if args.cleanup:
                await manager.cleanup_test_data()
                
        elif args.action == "cleanup":
            await manager.cleanup_test_data()
            
        elif args.action == "verify":
            stats = await manager.verify_database_setup()
            print(f"\nDatabase Statistics:")
            for table, count in stats.items():
                print(f"  {table}: {count} records")
                
    except Exception as e:
        logger.error("Script execution failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

