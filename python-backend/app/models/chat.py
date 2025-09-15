"""
Chat model definition
"""

import enum

from sqlalchemy import Column, String, Text, Boolean, Float, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class MessageRole(str, enum.Enum):
    """Message role enumeration"""
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"
    FUNCTION = "FUNCTION"


class Chat(Base, UUIDMixin, TimestampMixin):
    """Chat model"""
    
    __tablename__ = "chats"
    
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(MessageRole), nullable=False, index=True)
    content = Column(Text, nullable=False)
    message_metadata = Column(JSON, nullable=True)
    is_healthcare_query = Column(Boolean, default=False, nullable=False, index=True)
    citations = Column(JSON, nullable=True)
    confidence = Column(Float, nullable=True)
    
    # Relationships
    session = relationship("Session", back_populates="chats")
    user = relationship("User", back_populates="chats")
    cost_logs = relationship("CostLog", back_populates="chat", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Chat(id={self.id}, role='{self.role}', healthcare={self.is_healthcare_query})>"
