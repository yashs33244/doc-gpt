"""
Event model definition
"""

import enum

from sqlalchemy import Column, String, Text, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class EventType(str, enum.Enum):
    """Event type enumeration"""
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    FILE_UPLOAD = "FILE_UPLOAD"
    CHAT_START = "CHAT_START"
    CHAT_END = "CHAT_END"
    MEDICAL_QUERY = "MEDICAL_QUERY"
    SEARCH_PERFORMED = "SEARCH_PERFORMED"
    ERROR_OCCURRED = "ERROR_OCCURRED"
    SYSTEM_EVENT = "SYSTEM_EVENT"


class Severity(str, enum.Enum):
    """Severity level enumeration"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class Event(Base, UUIDMixin, TimestampMixin):
    """Event model"""
    
    __tablename__ = "events"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True)
    event_type = Column(Enum(EventType), nullable=False, index=True)
    description = Column(Text, nullable=True)
    severity = Column(Enum(Severity), default=Severity.INFO, nullable=False, index=True)
    event_metadata = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="events")
    session = relationship("Session", back_populates="events")
    
    def __repr__(self) -> str:
        return f"<Event(id={self.id}, type='{self.event_type}', severity='{self.severity}')>"
