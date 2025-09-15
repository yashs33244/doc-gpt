"""
Base model class with common fields and utilities
"""

import uuid
from datetime import datetime
from typing import Any, Dict

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """Base class for all database models"""
    pass


class TimestampMixin:
    """Mixin for models that need timestamp fields"""
    
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


class UUIDMixin:
    """Mixin for models that use UUID as primary key"""
    
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )


def generate_uuid() -> str:
    """Generate a new UUID string"""
    return str(uuid.uuid4())


def to_dict(obj: Any) -> Dict[str, Any]:
    """Convert SQLAlchemy model to dictionary"""
    if hasattr(obj, '__table__'):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    return {}

