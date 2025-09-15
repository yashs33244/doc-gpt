#!/usr/bin/env python3
"""
Configuration Test Script
Tests that environment variables are properly loaded from .env files
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent))

from app.core.config import settings
import structlog

logger = structlog.get_logger(__name__)

def test_config():
    """Test configuration loading"""
    print("🔧 Testing Configuration Loading...")
    print("=" * 50)
    
    # Test basic settings
    print(f"Project Name: {settings.PROJECT_NAME}")
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"API Version: {settings.API_V1_STR}")
    print(f"Database URL: {settings.DATABASE_URL}")
    print("")
    
    # Test API keys (hide sensitive parts)
    print("API Keys:")
    openai_key = settings.OPENAI_API_KEY
    if openai_key:
        print(f"  OpenAI: {openai_key[:8]}..." if len(openai_key) > 8 else "  OpenAI: Set (short key)")
    else:
        print("  OpenAI: Not set")
    
    anthropic_key = settings.ANTHROPIC_API_KEY
    if anthropic_key:
        print(f"  Anthropic: {anthropic_key[:8]}..." if len(anthropic_key) > 8 else "  Anthropic: Set (short key)")
    else:
        print("  Anthropic: Not set")
    
    tavily_key = settings.TAVILY_API_KEY
    if tavily_key:
        print(f"  Tavily: {tavily_key[:8]}..." if len(tavily_key) > 8 else "  Tavily: Set (short key)")
    else:
        print("  Tavily: Not set")
    
    print("")
    
    # Test service URLs
    print("Service URLs:")
    print(f"  Qdrant: {settings.QDRANT_URL}")
    print(f"  Redis: {settings.REDIS_URL}")
    print(f"  App URL: {settings.APP_URL}")
    print("")
    
    # Test list configurations
    print("List Configurations:")
    print(f"  CORS Origins: {settings.BACKEND_CORS_ORIGINS}")
    print(f"  Allowed Hosts: {settings.ALLOWED_HOSTS}")
    print(f"  File Types: {settings.ALLOWED_FILE_TYPES}")
    print("")
    
    # Test feature flags
    print("Feature Flags:")
    print(f"  Cost Tracking: {settings.ENABLE_COST_TRACKING}")
    print(f"  File Upload: {settings.ENABLE_FILE_UPLOAD}")
    print(f"  Web Search: {settings.ENABLE_WEB_SEARCH}")
    print(f"  Multi Model: {settings.ENABLE_MULTI_MODEL}")
    print("")
    
    # Test helper properties
    print("Helper Properties:")
    print(f"  Is Development: {settings.is_development}")
    print(f"  Is Production: {settings.is_production}")
    print(f"  Has OpenAI: {settings.has_openai}")
    print(f"  Has Anthropic: {settings.has_anthropic}")
    print(f"  Has Tavily: {settings.has_tavily}")
    print("")
    
    # Test database URLs
    print("Database URLs:")
    print(f"  Sync URL: {settings.database_url_sync}")
    print(f"  Async URL: {settings.database_url_async}")
    print("")
    
    print("✅ Configuration test completed!")
    
    # Warnings
    if not settings.has_openai and not settings.has_anthropic:
        print("⚠️  Warning: No AI provider API keys found!")
    
    if settings.SECRET_KEY == "your-secret-key-change-in-production":
        print("⚠️  Warning: Using default SECRET_KEY!")
    
    if settings.JWT_SECRET == "your-jwt-secret-here":
        print("⚠️  Warning: Using default JWT_SECRET!")

if __name__ == "__main__":
    test_config()

