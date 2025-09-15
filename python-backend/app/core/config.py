"""
Centralized configuration management for Doctor GPT Backend
Following Single Responsibility Principle - handles all environment variables in one place
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from pydantic import AnyHttpUrl, Field, validator
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables from .env files
load_dotenv(".env")



class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application Configuration
    PROJECT_NAME: str = Field(default="Doctor GPT Backend", env="PROJECT_NAME")
    VERSION: str = Field(default="1.0.0", env="VERSION")
    API_V1_STR: str = Field(default="/api/v1", env="API_V1_STR")
    ENVIRONMENT: str = Field(default="development", env="NODE_ENV")
    
    # Server Configuration
    SERVER_HOST: str = Field(default="0.0.0.0", env="SERVER_HOST")
    SERVER_PORT: int = Field(default=8000, env="SERVER_PORT")
    APP_URL: str = Field(default="http://localhost:3000", env="APP_URL")
    
    # Database Configuration
    DATABASE_URL: str = Field(default="postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt", env="DATABASE_URL")
    DIRECT_URL: Optional[str] = Field(default=None, env="DIRECT_URL")
    
    # AI Model API Keys
    OPENAI_API_KEY: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    ANTHROPIC_API_KEY: Optional[str] = Field(default=None, env="ANTHROPIC_API_KEY")
    
    # Search & External APIs
    TAVILY_API_KEY: Optional[str] = Field(default=None, env="TAVILY_API_KEY")
    
    # Vector Database Configuration (Qdrant)
    QDRANT_URL: str = Field(default="http://localhost:6333", env="QDRANT_URL")
    QDRANT_HTTP_PORT: int = Field(default=6333, env="QDRANT_HTTP_PORT")
    QDRANT_GRPC_PORT: int = Field(default=6334, env="QDRANT_GRPC_PORT")
    VECTOR_DIMENSIONS: int = Field(default=1536, env="VECTOR_DIMENSIONS")
    
    # Redis Configuration
    REDIS_URL: str = Field(default="redis://localhost:6379", env="REDIS_URL")
    REDIS_PORT: int = Field(default=6379, env="REDIS_PORT")
    
    # Security Configuration
    SECRET_KEY: str = Field(default="your-secret-key-change-in-production", env="SECRET_KEY")
    JWT_SECRET: str = Field(default="your-jwt-secret-here", env="JWT_SECRET")
    ALGORITHM: str = Field(default="HS256", env="ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    NEXTAUTH_SECRET: Optional[str] = Field(default=None, env="NEXTAUTH_SECRET")
    NEXTAUTH_URL: Optional[str] = Field(default=None, env="NEXTAUTH_URL")
    
    # CORS Configuration
    BACKEND_CORS_ORIGINS: Optional[List[str]] = Field(
        default=["*"],
        env="BACKEND_CORS_ORIGINS"
    )
    ALLOWED_HOSTS: Optional[List[str]] = Field(default=["*"], env="ALLOWED_HOSTS")
    
    # Cost Tracking
    ENABLE_COST_TRACKING: bool = Field(default=True, env="ENABLE_COST_TRACKING")
    
    # Rate Limiting
    RATE_LIMIT_MAX: int = Field(default=100, env="RATE_LIMIT_MAX")
    RATE_LIMIT_WINDOW: int = Field(default=900000, env="RATE_LIMIT_WINDOW")
    
    # File Upload Configuration
    MAX_FILE_SIZE: int = Field(default=10485760, env="MAX_FILE_SIZE")
    ALLOWED_FILE_TYPES: Optional[List[str]] = Field(default=["pdf","txt","docx","png","jpg","jpeg"], env="ALLOWED_FILE_TYPES")
    UPLOAD_DIR: str = Field(default="uploads", env="UPLOAD_DIR")
    
    # LangGraph Configuration
    LANGGRAPH_API_URL: Optional[str] = Field(default=None, env="LANGGRAPH_API_URL")
    
    # Email Configuration (all optional for development)
    SMTP_HOST: Optional[str] = Field(default=None, env="SMTP_HOST")
    SMTP_PORT: Optional[int] = Field(default=587, env="SMTP_PORT")
    SMTP_USER: Optional[str] = Field(default=None, env="SMTP_USER")
    SMTP_PASSWORD: Optional[str] = Field(default=None, env="SMTP_PASSWORD")
    SMTP_FROM: Optional[str] = Field(default=None, env="SMTP_FROM")
    
    # Monitoring & Analytics
    SENTRY_DSN: Optional[str] = Field(default=None, env="SENTRY_DSN")
    GOOGLE_ANALYTICS_ID: Optional[str] = Field(default=None, env="GOOGLE_ANALYTICS_ID")
    ENABLE_METRICS: bool = Field(default=True, env="ENABLE_METRICS")
    
    @validator("SMTP_PORT", pre=True, always=True)
    def validate_smtp_port(cls, v):
        """Handle empty string values for SMTP_PORT"""
        if v == "" or v is None:
            return 587
        return v
    
    # Feature Flags
    ENABLE_FILE_UPLOAD: bool = Field(default=True, env="ENABLE_FILE_UPLOAD")
    ENABLE_WEB_SEARCH: bool = Field(default=True, env="ENABLE_WEB_SEARCH")
    ENABLE_MULTI_MODEL: bool = Field(default=True, env="ENABLE_MULTI_MODEL")
    ENABLE_COST_ALERTS: bool = Field(default=True, env="ENABLE_COST_ALERTS")
    
    # Development Settings
    DEBUG_MODE: bool = Field(default=True, env="DEBUG_MODE")
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    
    # Celery Configuration
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/0", env="CELERY_BROKER_URL")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/0", env="CELERY_RESULT_BACKEND")
    
    @validator("BACKEND_CORS_ORIGINS", pre=True, always=True)
    def assemble_cors_origins(cls, v):
        if v is None:
            return ["http://localhost:3000", "http://localhost:3001", "http://localhost:8000"]
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []
    
    @validator("ALLOWED_HOSTS", pre=True, always=True)
    def assemble_allowed_hosts(cls, v):
        if v is None:
            return ["localhost", "127.0.0.1"]
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []
    
    @validator("ALLOWED_FILE_TYPES", pre=True, always=True)
    def assemble_allowed_file_types(cls, v):
        if v is None:
            return ["pdf", "txt", "docx", "png", "jpg", "jpeg"]
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []
    
    @property
    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.ENVIRONMENT == "development"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return self.ENVIRONMENT == "production"
    
    @property
    def has_openai(self) -> bool:
        """Check if OpenAI API key is available"""
        return bool(self.OPENAI_API_KEY)
    
    @property
    def has_anthropic(self) -> bool:
        """Check if Anthropic API key is available"""
        return bool(self.ANTHROPIC_API_KEY)
    
    @property
    def has_tavily(self) -> bool:
        """Check if Tavily API key is available"""
        return bool(self.TAVILY_API_KEY)
    
    @property
    def allowed_file_types_list(self) -> List[str]:
        """Get allowed file types as a list"""
        return self.ALLOWED_FILE_TYPES
    
    @property
    def database_url_sync(self) -> str:
        """Get synchronous database URL for SQLAlchemy"""
        return self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://")
    
    @property
    def database_url_async(self) -> str:
        """Get asynchronous database URL for SQLAlchemy"""
        return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
    
    def validate_required_settings(self) -> None:
        """Validate that required settings are present"""
        errors = []
        
        if not self.DATABASE_URL:
            errors.append("DATABASE_URL is required")
        
        if self.ENVIRONMENT == "production":
            if not self.SECRET_KEY or self.SECRET_KEY == "your-secret-key-change-in-production":
                errors.append("SECRET_KEY must be set in production")
            
            if not self.JWT_SECRET or self.JWT_SECRET == "your-jwt-secret-here":
                errors.append("JWT_SECRET must be set in production")
        
        if errors:
            raise ValueError(f"Configuration validation failed: {', '.join(errors)}")
    
    class Config:
        case_sensitive = True
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    settings = Settings()
    if os.getenv("VALIDATE_CONFIG", "true").lower() == "true":
        settings.validate_required_settings()
    return settings


# Global settings instance
settings = get_settings()


def get_config() -> Dict[str, Any]:
    """Get configuration as dictionary"""
    return settings.dict()


def validate_config() -> None:
    """Validate configuration and raise error if invalid"""
    settings.validate_required_settings()
    print("✅ Configuration validation successful")
