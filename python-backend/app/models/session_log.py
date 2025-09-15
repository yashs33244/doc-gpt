"""
Session Log model definition
"""

import enum
from decimal import Decimal

from sqlalchemy import Column, String, Text, Integer, ForeignKey, DECIMAL, Enum
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class LogSeverity(str, enum.Enum):
    """Log severity enumeration"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class SessionLog(Base, UUIDMixin, TimestampMixin):
    """Session Log model"""
    
    __tablename__ = "session_logs"
    
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    log_metadata = Column(JSON, nullable=True)
    severity = Column(Enum(LogSeverity), default=LogSeverity.INFO, nullable=False, index=True)
    response_time = Column(Integer, nullable=True)
    token_count = Column(Integer, nullable=True)
    cost_usd = Column(DECIMAL(10, 8), nullable=True)
    
    # Relationships
    session = relationship("Session", back_populates="session_logs")
    
    def __repr__(self) -> str:
        return f"<SessionLog(id={self.id}, action='{self.action}', severity='{self.severity}')>"
