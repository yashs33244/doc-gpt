"""
User model definition
"""

from sqlalchemy import Column, String
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class User(Base, UUIDMixin, TimestampMixin):
    """User model"""
    
    __tablename__ = "users"
    
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    
    # Relationships
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")
    cost_logs = relationship("CostLog", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")
    medical_reports = relationship("MedicalReport", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', name='{self.name}')>"

