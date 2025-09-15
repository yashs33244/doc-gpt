"""
Session model definition
"""

import enum
from decimal import Decimal

from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey, DECIMAL, Enum
from sqlalchemy.dialects.postgresql import JSON, ARRAY, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SessionCategory(str, enum.Enum):
    """Session category enumeration"""
    MEDICAL_CONSULTATION = "MEDICAL_CONSULTATION"
    DOCUMENT_ANALYSIS = "DOCUMENT_ANALYSIS"
    GENERAL_CHAT = "GENERAL_CHAT"
    RESEARCH = "RESEARCH"
    DIAGNOSTIC_SUPPORT = "DIAGNOSTIC_SUPPORT"
    TREATMENT_PLANNING = "TREATMENT_PLANNING"
    EDUCATION = "EDUCATION"
    OTHER = "OTHER"


class SessionStatus(str, enum.Enum):
    """Session status enumeration"""
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"
    DELETED = "DELETED"


class Session(Base, UUIDMixin, TimestampMixin):
    """Session model"""
    
    __tablename__ = "sessions"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    session_metadata = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    session_summary = Column(Text, nullable=True)
    tags = Column(ARRAY(String), default=[], nullable=False, index=True)
    category = Column(Enum(SessionCategory), nullable=True, index=True)
    vector_id = Column(String, nullable=True)
    message_count = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    total_cost = Column(DECIMAL(10, 8), default=Decimal("0"), nullable=False)
    last_activity_at = Column(String, nullable=False, index=True)  # Using created_at as default
    duration_minutes = Column(Integer, nullable=True)
    status = Column(Enum(SessionStatus), default=SessionStatus.ACTIVE, nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
    chats = relationship("Chat", back_populates="session", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="session", cascade="all, delete-orphan")
    session_files = relationship("SessionFile", back_populates="session", cascade="all, delete-orphan")
    session_logs = relationship("SessionLog", back_populates="session", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Session(id={self.id}, title='{self.title}', status='{self.status}')>"
