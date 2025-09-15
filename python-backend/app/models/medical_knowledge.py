"""
Medical Knowledge model definition
"""

from sqlalchemy import Column, String, Text, Float, DateTime
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.base import Base, TimestampMixin, UUIDMixin


class MedicalKnowledge(Base, UUIDMixin, TimestampMixin):
    """Medical Knowledge model"""
    
    __tablename__ = "medical_knowledge"
    
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(String, nullable=False, index=True)
    source_url = Column(String, nullable=True)
    pmid = Column(String, nullable=True)
    doi = Column(String, nullable=True)
    category = Column(String, nullable=False, index=True)
    tags = Column(ARRAY(String), default=[], nullable=False)
    specialty = Column(String, nullable=True, index=True)
    vector_id = Column(String, nullable=True)
    trust_score = Column(Float, nullable=True)
    last_updated = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self) -> str:
        return f"<MedicalKnowledge(id={self.id}, title='{self.title}', category='{self.category}')>"

