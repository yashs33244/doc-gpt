"""
File Upload API endpoints - Medical document upload and processing
Handles file uploads with text extraction and processing for medical documents
"""

import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.db.session import get_async_db
from app.models import User, MedicalReport, ReportType, ProcessingStatus
from app.services.document_processor import DocumentProcessorService
from app.services.cost_tracking import CostTrackingService
from app.services.medical_data import MedicalDataService
from app.utils.file_processing import (
    extract_text_from_file,
    generate_document_summary,
    detect_report_type,
    extract_medical_tags,
    get_extraction_method
)

logger = structlog.get_logger(__name__)
router = APIRouter()


# File type mappings
ALLOWED_FILE_TYPES = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif'
}

MEDICAL_REPORT_TYPES = {
    'lab_report': ReportType.LAB_REPORT,
    'prescription': ReportType.PRESCRIPTION,
    'diagnostic_image': ReportType.DIAGNOSTIC_IMAGE,
    'medical_history': ReportType.MEDICAL_HISTORY,
    'discharge_summary': ReportType.DISCHARGE_SUMMARY,
    'consultation_note': ReportType.CONSULTATION_NOTE,
    'other': ReportType.OTHER
}


class DocumentResponse(BaseModel):
    """Document response model"""
    id: str = Field(..., description="Document ID")
    fileName: str = Field(..., description="File name")
    fileType: str = Field(..., description="File type")
    fileSize: int = Field(..., description="File size in bytes")
    extractedText: str = Field(..., description="Extracted text content")
    summary: Optional[str] = Field(None, description="Document summary")
    reportType: str = Field(..., description="Detected report type")
    processingStatus: str = Field(..., description="Processing status")


class CostBreakdown(BaseModel):
    """Cost breakdown model"""
    extraction: float = Field(..., description="Text extraction cost")
    summary: float = Field(..., description="Summary generation cost")
    typeDetection: float = Field(..., description="Type detection cost")


class UploadResponse(BaseModel):
    """Upload response model"""
    success: bool = Field(..., description="Upload success status")
    document: Optional[DocumentResponse] = Field(None, description="Uploaded document details")
    error: Optional[str] = Field(None, description="Error message if failed")
    cost: Optional[Dict[str, Any]] = Field(None, description="Cost information")


async def create_or_get_user(db: AsyncSession, user_id: str) -> User:
    """Create or get user by ID"""
    try:
        # Try to get existing user
        result = await db.execute(
            text("SELECT * FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        )
        user = result.fetchone()
        
        if user:
            return user
        
        # Create new user
        new_user = User(
            id=user_id,
            email=f"user-{user_id}@example.com",
            name="Medical User"
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        return new_user
        
    except Exception as e:
        logger.error("Failed to create or get user", user_id=user_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create or get user"
        )


@router.post("/medical-documents", response_model=UploadResponse)
async def upload_medical_document(
    file: UploadFile = File(...),
    userId: Optional[str] = Form(None),
    sessionId: Optional[str] = Form(None),
    reportType: str = Form("other"),
    metadata: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_async_db)
) -> UploadResponse:
    """
    Medical Document Upload Endpoint
    Handles file uploads with text extraction and processing for medical documents
    """
    start_time = datetime.now()
    
    try:
        # Generate IDs if not provided
        actual_user_id = userId or str(uuid.uuid4())
        actual_session_id = sessionId or str(uuid.uuid4())
        
        # Validate file
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No file provided"
            )
        
        # Check file size
        if file.size and file.size > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds limit of {settings.MAX_FILE_SIZE // 1024 // 1024}MB"
            )
        
        # Check file type
        if file.content_type not in ALLOWED_FILE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type {file.content_type} not supported"
            )
        
        file_type = ALLOWED_FILE_TYPES[file.content_type]
        
        # Parse metadata
        parsed_metadata: Dict[str, Any] = {}
        if metadata:
            try:
                import json
                parsed_metadata = json.loads(metadata)
            except Exception:
                logger.warning("Failed to parse metadata, using empty object")
        
        logger.info(
            "Processing file upload",
            filename=file.filename,
            file_type=file_type,
            user_id=actual_user_id,
            file_size=file.size
        )
        
        # Read file content
        file_content = await file.read()
        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        # Extract text from file
        try:
            extraction_result = await extract_text_from_file(file_content, file_type)
            extracted_text = extraction_result["extractedText"]
            extraction_cost = extraction_result["extractionCost"]
            
            if not extracted_text or extracted_text.strip() == "":
                raise ValueError("No text content could be extracted from the file")
            
            logger.info(
                "Text extraction successful",
                text_length=len(extracted_text),
                extraction_cost=extraction_cost
            )
            
        except Exception as extraction_error:
            logger.error("Text extraction failed", error=str(extraction_error))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to extract text from {file.filename}: {str(extraction_error)}"
            )
        
        # Generate summary if text is long enough
        summary: Optional[str] = None
        summary_cost = 0.0
        if len(extracted_text) > 500:
            summary_result = await generate_document_summary(extracted_text, actual_user_id)
            summary = summary_result["summary"]
            summary_cost = summary_result["cost"]
        
        # Detect report type if not specified or if 'other'
        detected_report_type = reportType
        detection_cost = 0.0
        if reportType == "other" and len(extracted_text) > 100:
            detection_result = await detect_report_type(extracted_text, actual_user_id)
            detected_report_type = detection_result["reportType"]
            detection_cost = detection_result["cost"]
        
        # Create document record in database
        document_id = str(uuid.uuid4())
        
        # Create user if doesn't exist
        user = await create_or_get_user(db, actual_user_id)
        
        # Extract medical tags
        medical_tags = await extract_medical_tags(extracted_text)
        
        # Save document to database
        medical_report = MedicalReport(
            id=document_id,
            user_id=actual_user_id,
            file_name=file.filename,
            file_type=file_type,
            file_size=file.size or len(file_content),
            extracted_text=extracted_text,
            summary=summary,
            report_type=MEDICAL_REPORT_TYPES.get(detected_report_type, ReportType.OTHER),
            processing_status=ProcessingStatus.COMPLETED,
            medical_tags=medical_tags,
            metadata={
                **parsed_metadata,
                "originalFileName": file.filename,
                "uploadTimestamp": datetime.utcnow().isoformat(),
                "processingTime": int((datetime.now() - start_time).total_seconds() * 1000),
                "fileSize": file.size or len(file_content),
                "extractionMethod": get_extraction_method(file_type),
                "contentType": file.content_type
            }
        )
        
        db.add(medical_report)
        await db.commit()
        await db.refresh(medical_report)
        
        # Process document using the preprocessing pipeline
        try:
            document_processor = DocumentProcessorService(db)
            
            # Create preprocessing metadata
            preprocessing_metadata = {
                "patientId": actual_user_id,
                "doctorId": None,
                "docType": detected_report_type,
                "date": datetime.utcnow().isoformat(),
                "source": "uploaded_document",
                "medicalTerms": medical_tags,
                "normalizedUnits": {},
                "confidence": 0.9,
                "processingVersion": "1.2.0"
            }
            
            logger.info("Starting document preprocessing", document_id=document_id)
            
            preprocessing_result = await document_processor.preprocess_document(
                document_id=document_id,
                text_content=extracted_text,
                metadata=preprocessing_metadata,
                context={
                    "userId": actual_user_id,
                    "sessionId": actual_session_id
                }
            )
            
            if preprocessing_result.get("success"):
                logger.info(
                    "Document processed successfully",
                    document_id=document_id,
                    chunks_created=len(preprocessing_result.get("chunks", []))
                )
                
                # Update medical report with preprocessing metadata
                medical_report.metadata = {
                    **medical_report.metadata,
                    "preprocessing": {
                        "success": True,
                        "chunkCount": len(preprocessing_result.get("chunks", [])),
                        "qualityScore": preprocessing_result.get("metadata", {}).get("qualityScore"),
                        "processingTime": preprocessing_result.get("metadata", {}).get("processingTime"),
                        "version": preprocessing_result.get("metadata", {}).get("version"),
                        "cost": preprocessing_result.get("cost", {}).get("total", 0)
                    }
                }
                await db.commit()
                
            else:
                logger.warning(
                    "Document preprocessing failed, attempting fallback",
                    document_id=document_id,
                    error=preprocessing_result.get("error")
                )
                
                # Fallback to medical data service
                medical_service = MedicalDataService(db)
                
                session_document = {
                    "id": document_id,
                    "sessionId": actual_session_id,
                    "userId": actual_user_id,
                    "fileName": file.filename,
                    "content": extracted_text,
                    "extractedText": extracted_text,
                    "fileType": file_type,
                    "metadata": {
                        **parsed_metadata,
                        "summary": summary,
                        "reportType": detected_report_type,
                        "medicalTags": medical_tags
                    }
                }
                
                ingest_result = await medical_service.ingest_session_document(
                    actual_session_id, actual_user_id, session_document
                )
                
                if ingest_result.get("success"):
                    logger.info("Document ingested using fallback method", document_id=document_id)
                else:
                    logger.warning(
                        "Both preprocessing and fallback ingestion failed",
                        document_id=document_id,
                        error=ingest_result.get("error")
                    )
                    
        except Exception as preprocessing_error:
            logger.error("Document preprocessing error", error=str(preprocessing_error))
            # Continue without failing - document is still saved in PostgreSQL
        
        # Track costs
        total_cost = extraction_cost + summary_cost + detection_cost
        cost_service = CostTrackingService(db)
        await cost_service.track_cost(
            user_id=actual_user_id,
            session_id=actual_session_id,
            operation="FILE_PROCESSING",
            provider="document_processor",
            input_cost=total_cost,
            output_cost=0,
            total_cost=total_cost,
            currency="USD",
            metadata={
                "fileName": file.filename,
                "fileType": file_type,
                "fileSize": file.size or len(file_content),
                "extractedTextLength": len(extracted_text),
                "reportType": detected_report_type,
                "processingSteps": [
                    step for step, enabled in [
                        ("extraction", True),
                        ("summary", bool(summary)),
                        ("type_detection", detected_report_type != reportType)
                    ] if enabled
                ]
            }
        )
        
        # Prepare response
        response = UploadResponse(
            success=True,
            document=DocumentResponse(
                id=str(medical_report.id),
                fileName=medical_report.file_name,
                fileType=medical_report.file_type,
                fileSize=medical_report.file_size,
                extractedText=medical_report.extracted_text,
                summary=medical_report.summary,
                reportType=medical_report.report_type.value if medical_report.report_type else "OTHER",
                processingStatus=medical_report.processing_status.value
            ),
            cost={
                "totalCost": total_cost,
                "breakdown": {
                    "extraction": extraction_cost,
                    "summary": summary_cost,
                    "typeDetection": detection_cost
                }
            }
        )
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        logger.info(
            "Document processed successfully",
            document_id=document_id,
            processing_time=processing_time
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("File upload processing failed", error=str(e), exc_info=True)
        
        # Track error cost
        try:
            cost_service = CostTrackingService(db)
            await cost_service.track_cost(
                user_id="unknown",
                operation="FILE_PROCESSING",
                provider="error",
                input_cost=0,
                output_cost=0.001,
                total_cost=0.001,
                currency="USD",
                metadata={
                    "error": str(e),
                    "endpoint": "/api/v1/upload/medical-documents"
                }
            )
        except Exception as cost_error:
            logger.error("Failed to track error cost", error=str(cost_error))
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process file" if not settings.is_development else str(e)
        )


@router.get("/medical-documents")
async def upload_health_check():
    """Health check endpoint for medical document upload API"""
    return {
        "status": "healthy",
        "service": "medical-document-upload-api",
        "supportedTypes": list(ALLOWED_FILE_TYPES.keys()),
        "maxFileSize": settings.MAX_FILE_SIZE,
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }
