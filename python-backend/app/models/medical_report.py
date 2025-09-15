"""
Medical Report model definition
"""

import enum

from sqlalchemy import Column, String, Integer, Text, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSON, ARRAY, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ReportType(str, enum.Enum):
    """Report type enumeration"""
    LAB_REPORT = "LAB_REPORT"
    PRESCRIPTION = "PRESCRIPTION"
    DIAGNOSTIC_IMAGE = "DIAGNOSTIC_IMAGE"
    MEDICAL_HISTORY = "MEDICAL_HISTORY"
    DISCHARGE_SUMMARY = "DISCHARGE_SUMMARY"
    CONSULTATION_NOTE = "CONSULTATION_NOTE"
    OTHER = "OTHER"


class ProcessingStatus(str, enum.Enum):
    """Processing status enumeration"""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ARCHIVED = "ARCHIVED"


class MedicalReport(Base, UUIDMixin, TimestampMixin):
    """Medical Report model"""
    
    __tablename__ = "medical_reports"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    original_path = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    report_type = Column(Enum(ReportType), nullable=True, index=True)
    vector_id = Column(String, nullable=True)
    processing_status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING, nullable=False, index=True)
    medical_tags = Column(ARRAY(String), default=[], nullable=False)
    patient_info = Column(JSON, nullable=True)
    report_metadata = Column(JSON, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="medical_reports")
    document_chunks = relationship("DocumentChunk", back_populates="medical_report", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<MedicalReport(id={self.id}, filename='{self.file_name}', type='{self.report_type}')>"
