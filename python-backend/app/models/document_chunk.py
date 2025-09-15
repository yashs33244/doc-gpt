"""
Document Chunk model definition
"""

from decimal import Decimal

from sqlalchemy import Column, String, Integer, Text, Float, ForeignKey, DECIMAL
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class DocumentChunk(Base, UUIDMixin, TimestampMixin):
    """Document Chunk model"""
    
    __tablename__ = "document_chunks"
    
    content = Column(Text, nullable=False)
    start_index = Column(Integer, nullable=False)
    end_index = Column(Integer, nullable=False)
    token_count = Column(Integer, nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, index=True)
    semantic_section = Column(String, nullable=True, index=True)
    chunk_metadata = Column(JSON, nullable=True)
    vector_id = Column(String, nullable=True)
    embedding_model = Column(String, nullable=True)
    processing_cost = Column(DECIMAL(10, 8), nullable=True)
    quality_score = Column(Float, nullable=True, index=True)
    
    # Parent document references - a chunk belongs to either a medical report OR session file
    medical_report_id = Column(UUID(as_uuid=True), ForeignKey("medical_reports.id", ondelete="CASCADE"), nullable=True, index=True)
    session_file_id = Column(UUID(as_uuid=True), ForeignKey("session_files.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Relationships
    medical_report = relationship("MedicalReport", back_populates="document_chunks")
    session_file = relationship("SessionFile", back_populates="document_chunks")
    
    def __repr__(self) -> str:
        return f"<DocumentChunk(id={self.id}, chunk_index={self.chunk_index}, tokens={self.token_count})>"
