"""
Session File model definition
"""

import enum

from sqlalchemy import Column, String, Integer, Text, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSON, ARRAY, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class FileProcessingStatus(str, enum.Enum):
    """File processing status enumeration"""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ARCHIVED = "ARCHIVED"


class SessionFile(Base, UUIDMixin, TimestampMixin):
    """Session File model"""
    
    __tablename__ = "session_files"
    
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False, index=True)
    file_size = Column(Integer, nullable=False)
    file_path = Column(String, nullable=True)
    original_name = Column(String, nullable=True)
    processing_status = Column(Enum(FileProcessingStatus), default=FileProcessingStatus.PENDING, nullable=False, index=True)
    extracted_text = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    tags = Column(ARRAY(String), default=[], nullable=False, index=True)
    vector_id = Column(String, nullable=True)
    file_metadata = Column(JSON, nullable=True)
    uploaded_at = Column(String, nullable=False)  # Using created_at as default
    
    # Relationships
    session = relationship("Session", back_populates="session_files")
    document_chunks = relationship("DocumentChunk", back_populates="session_file", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<SessionFile(id={self.id}, filename='{self.file_name}', status='{self.processing_status}')>"
