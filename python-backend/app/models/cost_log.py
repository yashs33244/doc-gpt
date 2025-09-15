"""
Cost Log model definition
"""

import enum
from decimal import Decimal

from sqlalchemy import Column, String, Integer, ForeignKey, DECIMAL, Enum
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Operation(str, enum.Enum):
    """Operation type enumeration"""
    CHAT_COMPLETION = "CHAT_COMPLETION"
    EMBEDDING_GENERATION = "EMBEDDING_GENERATION"
    VECTOR_SEARCH = "VECTOR_SEARCH"
    WEB_SEARCH = "WEB_SEARCH"
    FILE_PROCESSING = "FILE_PROCESSING"
    MODEL_INFERENCE = "MODEL_INFERENCE"
    API_CALL = "API_CALL"
    MULTI_MODEL_REASONING = "MULTI_MODEL_REASONING"
    MEDICAL_ANALYSIS = "MEDICAL_ANALYSIS"
    CITATION_LOOKUP = "CITATION_LOOKUP"


class CostLog(Base, UUIDMixin, TimestampMixin):
    """Cost Log model"""
    
    __tablename__ = "cost_logs"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    chat_id = Column(UUID(as_uuid=True), ForeignKey("chats.id", ondelete="SET NULL"), nullable=True)
    operation = Column(Enum(Operation), nullable=False, index=True)
    model_provider = Column(String, nullable=True, index=True)
    model_name = Column(String, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    cost_usd = Column(DECIMAL(10, 8), nullable=False)
    cost_metadata = Column(JSON, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="cost_logs")
    chat = relationship("Chat", back_populates="cost_logs")
    
    def __repr__(self) -> str:
        return f"<CostLog(id={self.id}, operation='{self.operation}', cost={self.cost_usd})>"
