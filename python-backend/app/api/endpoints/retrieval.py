"""
Retrieval API endpoints - Document ingestion and RAG operations
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_async_db
from app.services.medical_data import MedicalDataService
from app.services.qdrant_service import QdrantService

logger = structlog.get_logger(__name__)
router = APIRouter()


class IngestRequest(BaseModel):
    """Document ingestion request model"""
    text: str = Field(..., description="Text content to ingest")
    source: str = Field(..., description="Source of the content")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    userId: Optional[str] = Field(None, description="User ID")
    sessionId: Optional[str] = Field(None, description="Session ID")


class IngestResponse(BaseModel):
    """Document ingestion response model"""
    success: bool = Field(..., description="Ingestion success status")
    documentId: Optional[str] = Field(None, description="Generated document ID")
    chunks: Optional[int] = Field(None, description="Number of chunks created")
    vectorsStored: Optional[int] = Field(None, description="Number of vectors stored")
    processingTime: int = Field(..., description="Processing time in milliseconds")
    error: Optional[str] = Field(None, description="Error message if failed")


class RetrievalRequest(BaseModel):
    """Retrieval request model"""
    query: str = Field(..., description="Search query")
    userId: Optional[str] = Field(None, description="User ID for personalized search")
    sessionId: Optional[str] = Field(None, description="Session ID for context")
    limit: int = Field(10, description="Maximum number of results")
    scoreThreshold: float = Field(0.7, description="Minimum similarity score")
    sources: List[str] = Field(default_factory=list, description="Specific sources to search")


class RetrievalResult(BaseModel):
    """Retrieval result model"""
    id: str = Field(..., description="Result ID")
    content: str = Field(..., description="Content text")
    source: str = Field(..., description="Content source")
    score: float = Field(..., description="Similarity score")
    metadata: Dict[str, Any] = Field(..., description="Additional metadata")


class RetrievalResponse(BaseModel):
    """Retrieval response model"""
    success: bool = Field(..., description="Retrieval success status")
    results: List[RetrievalResult] = Field(..., description="Retrieval results")
    query: str = Field(..., description="Original query")
    totalResults: int = Field(..., description="Total number of results")
    processingTime: int = Field(..., description="Processing time in milliseconds")
    error: Optional[str] = Field(None, description="Error message if failed")


@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(
    request: IngestRequest,
    db: AsyncSession = Depends(get_async_db)
) -> IngestResponse:
    """
    Document Ingestion Endpoint
    Ingests text content into the vector database for RAG operations
    """
    start_time = datetime.now()
    
    try:
        if not request.text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Text content cannot be empty"
            )
        
        logger.info(
            "Starting document ingestion",
            text_length=len(request.text),
            source=request.source,
            user_id=request.userId,
            session_id=request.sessionId
        )
        
        # Initialize services
        medical_service = MedicalDataService(db)
        qdrant_service = QdrantService()
        
        # Check Qdrant health
        is_healthy = await qdrant_service.health_check()
        if not is_healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Vector database service is not available"
            )
        
        # Prepare document for ingestion
        document = {
            "content": request.text,
            "source": request.source,
            "metadata": {
                **request.metadata,
                "ingestedAt": datetime.utcnow().isoformat(),
                "textLength": len(request.text)
            }
        }
        
        # Ingest based on context
        if request.sessionId and request.userId:
            # Session-specific ingestion
            session_document = {
                **document,
                "id": f"ingested-{datetime.now().timestamp()}",
                "sessionId": request.sessionId,
                "userId": request.userId,
                "fileName": f"ingested-{request.source}",
                "fileType": "text"
            }
            
            result = await medical_service.ingest_session_document(
                request.sessionId,
                request.userId,
                session_document
            )
        else:
            # Global knowledge ingestion
            result = await medical_service.ingest_medical_knowledge(
                title=f"Ingested content from {request.source}",
                content=request.text,
                source=request.source,
                metadata=document["metadata"]
            )
        
        if not result.get("success"):
            raise Exception(result.get("error", "Ingestion failed"))
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        logger.info(
            "Document ingestion completed",
            document_id=result.get("documentId"),
            chunks=result.get("chunks", 0),
            vectors_stored=result.get("vectorsStored", 0),
            processing_time=processing_time
        )
        
        return IngestResponse(
            success=True,
            documentId=result.get("documentId"),
            chunks=result.get("chunks", 0),
            vectorsStored=result.get("vectorsStored", 0),
            processingTime=processing_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Document ingestion failed", error=str(e))
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return IngestResponse(
            success=False,
            processingTime=processing_time,
            error=str(e) if settings.is_development else "Ingestion failed"
        )


@router.post("/search", response_model=RetrievalResponse)
async def search_documents(
    request: RetrievalRequest,
    db: AsyncSession = Depends(get_async_db)
) -> RetrievalResponse:
    """
    Document Retrieval Endpoint
    Searches the vector database for relevant content based on query
    """
    start_time = datetime.now()
    
    try:
        if not request.query.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Search query cannot be empty"
            )
        
        logger.info(
            "Starting document retrieval",
            query=request.query,
            user_id=request.userId,
            session_id=request.sessionId,
            limit=request.limit,
            score_threshold=request.scoreThreshold
        )
        
        # Initialize services
        medical_service = MedicalDataService(db)
        qdrant_service = QdrantService()
        
        # Check Qdrant health
        is_healthy = await qdrant_service.health_check()
        if not is_healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Vector database service is not available"
            )
        
        # Perform search based on context
        if request.sessionId and request.userId:
            # Search with session context
            search_result = await medical_service.query_medical_knowledge(
                query=request.query,
                user_id=request.userId,
                session_id=request.sessionId,
                use_global_knowledge=True,
                use_session_documents=True,
                limit=request.limit,
                score_threshold=request.scoreThreshold
            )
        else:
            # Global search
            search_result = await medical_service.search_medical_knowledge(
                query=request.query,
                limit=request.limit,
                score_threshold=request.scoreThreshold,
                sources=request.sources if request.sources else None
            )
        
        # Format results
        results = []
        if search_result.get("success") and search_result.get("results"):
            for result in search_result["results"]:
                results.append(RetrievalResult(
                    id=str(result.get("id", "")),
                    content=result.get("content", ""),
                    source=result.get("source", "unknown"),
                    score=float(result.get("score", 0.0)),
                    metadata=result.get("metadata", {})
                ))
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        logger.info(
            "Document retrieval completed",
            results_count=len(results),
            processing_time=processing_time
        )
        
        return RetrievalResponse(
            success=True,
            results=results,
            query=request.query,
            totalResults=len(results),
            processingTime=processing_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Document retrieval failed", error=str(e))
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return RetrievalResponse(
            success=False,
            results=[],
            query=request.query,
            totalResults=0,
            processingTime=processing_time,
            error=str(e) if settings.is_development else "Retrieval failed"
        )


@router.get("/health")
async def retrieval_health_check():
    """Health check for retrieval endpoints"""
    try:
        qdrant_service = QdrantService()
        qdrant_healthy = await qdrant_service.health_check()
        
        return {
            "status": "healthy",
            "service": "doctor-gpt-retrieval-api",
            "version": "1.0.0",
            "services": {
                "qdrant": "healthy" if qdrant_healthy else "unhealthy"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error("Retrieval health check failed", error=str(e))
        return {
            "status": "degraded",
            "service": "doctor-gpt-retrieval-api",
            "version": "1.0.0",
            "services": {
                "qdrant": "unknown"
            },
            "error": str(e) if settings.is_development else "Health check failed",
            "timestamp": datetime.utcnow().isoformat()
        }

