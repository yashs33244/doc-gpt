"""
Admin API endpoints - Qdrant management and system administration
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_async_db
from app.services.qdrant_service import QdrantService

logger = structlog.get_logger(__name__)
router = APIRouter()


class CollectionInfo(BaseModel):
    """Collection information model"""
    name: str = Field(..., description="Collection name")
    pointsCount: int = Field(..., description="Number of points in collection")
    vectorsCount: int = Field(..., description="Number of vectors in collection")
    indexedVectorsCount: int = Field(..., description="Number of indexed vectors")
    status: str = Field(..., description="Collection status")


class CollectionResponse(BaseModel):
    """Collection response model"""
    success: bool = Field(..., description="Operation success status")
    collections: List[CollectionInfo] = Field(..., description="Collection information")
    error: Optional[str] = Field(None, description="Error message if failed")


class SearchRequest(BaseModel):
    """Search request model"""
    query: str = Field(..., description="Search query text")
    collection: str = Field("medical_knowledge", description="Collection to search")
    limit: int = Field(10, description="Maximum number of results")
    scoreThreshold: float = Field(0.7, description="Minimum similarity score")


class SearchResult(BaseModel):
    """Search result model"""
    id: str = Field(..., description="Result ID")
    score: float = Field(..., description="Similarity score")
    payload: Dict[str, Any] = Field(..., description="Result payload")


class SearchResponse(BaseModel):
    """Search response model"""
    success: bool = Field(..., description="Search success status")
    results: List[SearchResult] = Field(..., description="Search results")
    query: str = Field(..., description="Original query")
    totalResults: int = Field(..., description="Total number of results")
    processingTime: int = Field(..., description="Processing time in milliseconds")
    error: Optional[str] = Field(None, description="Error message if failed")


@router.get("/qdrant/collections", response_model=CollectionResponse)
async def get_qdrant_collections(
    db: AsyncSession = Depends(get_async_db)
) -> CollectionResponse:
    """
    Get Qdrant Collections
    Retrieves information about all Qdrant collections
    """
    try:
        qdrant_service = QdrantService()
        
        # Check Qdrant health
        is_healthy = await qdrant_service.health_check()
        if not is_healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Qdrant service is not available"
            )
        
        # Get all collections info
        collections_info = await qdrant_service.get_all_collections_info()
        
        collections = [
            CollectionInfo(
                name=name,
                pointsCount=info.get("pointsCount", 0),
                vectorsCount=info.get("vectorsCount", 0),
                indexedVectorsCount=info.get("indexedVectorsCount", 0),
                status=info.get("status", "unknown")
            )
            for name, info in collections_info.items()
        ]
        
        logger.info(
            "Retrieved Qdrant collections",
            collection_count=len(collections),
            collections=[c.name for c in collections]
        )
        
        return CollectionResponse(
            success=True,
            collections=collections
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get Qdrant collections", error=str(e))
        return CollectionResponse(
            success=False,
            collections=[],
            error=str(e) if settings.is_development else "Failed to retrieve collections"
        )


@router.post("/qdrant/search", response_model=SearchResponse)
async def search_qdrant(
    request: SearchRequest,
    db: AsyncSession = Depends(get_async_db)
) -> SearchResponse:
    """
    Search Qdrant Collections
    Performs semantic search across Qdrant collections
    """
    start_time = datetime.now()
    
    try:
        qdrant_service = QdrantService()
        
        # Check Qdrant health
        is_healthy = await qdrant_service.health_check()
        if not is_healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Qdrant service is not available"
            )
        
        logger.info(
            "Performing Qdrant search",
            query=request.query,
            collection=request.collection,
            limit=request.limit,
            score_threshold=request.scoreThreshold
        )
        
        # Perform search based on collection type
        if request.collection == "medical_knowledge":
            results = await qdrant_service.search_medical_knowledge(
                query=request.query,
                limit=request.limit,
                score_threshold=request.scoreThreshold
            )
        elif request.collection == "sessions":
            results = await qdrant_service.search_sessions(
                query_vector=None,  # Will be generated from query text
                user_id="admin",  # Admin search across all users
                options={
                    "limit": request.limit,
                    "scoreThreshold": request.scoreThreshold
                }
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown collection: {request.collection}"
            )
        
        # Format results
        search_results = [
            SearchResult(
                id=str(result.get("id", "")),
                score=float(result.get("score", 0.0)),
                payload=result.get("payload", {})
            )
            for result in results
        ]
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        logger.info(
            "Qdrant search completed",
            results_count=len(search_results),
            processing_time=processing_time
        )
        
        return SearchResponse(
            success=True,
            results=search_results,
            query=request.query,
            totalResults=len(search_results),
            processingTime=processing_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Qdrant search failed", error=str(e))
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return SearchResponse(
            success=False,
            results=[],
            query=request.query,
            totalResults=0,
            processingTime=processing_time,
            error=str(e) if settings.is_development else "Search failed"
        )


@router.post("/qdrant/collections/{collection_name}/initialize")
async def initialize_qdrant_collection(
    collection_name: str,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Initialize Qdrant Collection
    Creates and configures a specific Qdrant collection
    """
    try:
        qdrant_service = QdrantService()
        
        # Check Qdrant health
        is_healthy = await qdrant_service.health_check()
        if not is_healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Qdrant service is not available"
            )
        
        logger.info("Initializing Qdrant collection", collection=collection_name)
        
        # Initialize the specific collection
        if collection_name == "medical_knowledge":
            success = await qdrant_service.initialize_medical_knowledge_collection()
        elif collection_name == "sessions":
            success = await qdrant_service.initialize_sessions_collection()
        elif collection_name == "documents":
            success = await qdrant_service.initialize_documents_collection()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown collection: {collection_name}"
            )
        
        if success:
            logger.info("Collection initialized successfully", collection=collection_name)
            return {
                "success": True,
                "message": f"Collection '{collection_name}' initialized successfully",
                "collection": collection_name
            }
        else:
            raise Exception("Collection initialization failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to initialize collection", collection=collection_name, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e) if settings.is_development else "Failed to initialize collection"
        )


@router.delete("/qdrant/collections/{collection_name}")
async def delete_qdrant_collection(
    collection_name: str,
    confirm: bool = False,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Delete Qdrant Collection
    Permanently deletes a Qdrant collection and all its data
    """
    try:
        if not confirm:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Collection deletion requires confirmation (confirm=true)"
            )
        
        qdrant_service = QdrantService()
        
        # Check Qdrant health
        is_healthy = await qdrant_service.health_check()
        if not is_healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Qdrant service is not available"
            )
        
        logger.warning("Deleting Qdrant collection", collection=collection_name)
        
        # Delete the collection
        success = await qdrant_service.delete_collection(collection_name)
        
        if success:
            logger.warning("Collection deleted successfully", collection=collection_name)
            return {
                "success": True,
                "message": f"Collection '{collection_name}' deleted successfully",
                "collection": collection_name
            }
        else:
            raise Exception("Collection deletion failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete collection", collection=collection_name, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e) if settings.is_development else "Failed to delete collection"
        )


@router.get("/health")
async def admin_health_check():
    """Health check for admin endpoints"""
    try:
        qdrant_service = QdrantService()
        qdrant_healthy = await qdrant_service.health_check()
        
        return {
            "status": "healthy",
            "service": "doctor-gpt-admin-api",
            "version": "1.0.0",
            "services": {
                "qdrant": "healthy" if qdrant_healthy else "unhealthy"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error("Admin health check failed", error=str(e))
        return {
            "status": "degraded",
            "service": "doctor-gpt-admin-api",
            "version": "1.0.0",
            "services": {
                "qdrant": "unknown"
            },
            "error": str(e) if settings.is_development else "Health check failed",
            "timestamp": datetime.utcnow().isoformat()
        }

