"""
Qdrant Vector Database Service
Handles all vector database operations for medical documents and knowledge
"""

import json
import uuid
from typing import Any, Dict, List, Optional, Tuple

import structlog
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams

from app.core.config import settings

logger = structlog.get_logger(__name__)


class QdrantService:
    """Service for managing Qdrant vector database operations"""
    
    def __init__(self):
        self.client = QdrantClient(url=settings.QDRANT_URL, check_compatibility=False)
        self.vector_size = settings.VECTOR_DIMENSIONS
        
        # Collection names
        self.MEDICAL_KNOWLEDGE_COLLECTION = "medical_knowledge"
        self.SESSIONS_COLLECTION = "sessions"
        self.DOCUMENTS_COLLECTION = "documents"
        self.CHUNKS_COLLECTION = "document_chunks"
    
    async def health_check(self) -> bool:
        """Check if Qdrant is healthy"""
        try:
            # Try to get collections list as a health check
            collections = self.client.get_collections()
            return True
        except Exception as e:
            logger.error("Qdrant health check failed", error=str(e))
            return False
    
    async def initialize_collections(self) -> bool:
        """Initialize all required collections"""
        try:
            collections = [
                self.MEDICAL_KNOWLEDGE_COLLECTION,
                self.SESSIONS_COLLECTION,
                self.DOCUMENTS_COLLECTION,
                self.CHUNKS_COLLECTION
            ]
            
            for collection_name in collections:
                await self._create_collection_if_not_exists(collection_name)
            
            logger.info("All Qdrant collections initialized successfully")
            return True
            
        except Exception as e:
            logger.error("Failed to initialize Qdrant collections", error=str(e))
            return False
    
    async def _create_collection_if_not_exists(self, collection_name: str) -> bool:
        """Create collection if it doesn't exist"""
        try:
            # Check if collection exists
            collections = self.client.get_collections()
            existing_names = [col.name for col in collections.collections]
            
            if collection_name not in existing_names:
                # Create collection with appropriate configuration
                self.client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(
                        size=self.vector_size,
                        distance=Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection: {collection_name}")
            else:
                logger.info(f"Qdrant collection already exists: {collection_name}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to create collection {collection_name}", error=str(e))
            return False
    
    async def store_medical_knowledge(
        self,
        knowledge_id: str,
        vector: List[float],
        payload: Dict[str, Any]
    ) -> bool:
        """Store medical knowledge vector"""
        try:
            self.client.upsert(
                collection_name=self.MEDICAL_KNOWLEDGE_COLLECTION,
                points=[
                    models.PointStruct(
                        id=knowledge_id,
                        vector=vector,
                        payload=payload
                    )
                ]
            )
            
            logger.debug("Stored medical knowledge vector", knowledge_id=knowledge_id)
            return True
            
        except Exception as e:
            logger.error("Failed to store medical knowledge vector", knowledge_id=knowledge_id, error=str(e))
            return False
    
    async def search_medical_knowledge(
        self,
        query_vector: List[float],
        limit: int = 10,
        score_threshold: float = 0.7,
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search medical knowledge by vector similarity"""
        try:
            search_results = self.client.search(
                collection_name=self.MEDICAL_KNOWLEDGE_COLLECTION,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold,
                query_filter=models.Filter(**filter_conditions) if filter_conditions else None
            )
            
            results = []
            for result in search_results:
                results.append({
                    "id": str(result.id),
                    "score": float(result.score),
                    "payload": result.payload
                })
            
            logger.debug("Medical knowledge search completed", results_count=len(results))
            return results
            
        except Exception as e:
            logger.error("Medical knowledge search failed", error=str(e))
            return []
    
    async def store_session_vector(
        self,
        session_id: str,
        vector: List[float],
        payload: Dict[str, Any]
    ) -> bool:
        """Store session vector"""
        try:
            self.client.upsert(
                collection_name=self.SESSIONS_COLLECTION,
                points=[
                    models.PointStruct(
                        id=session_id,
                        vector=vector,
                        payload={
                            **payload,
                            "sessionId": session_id,
                            "type": "session"
                        }
                    )
                ]
            )
            
            logger.debug("Stored session vector", session_id=session_id)
            return True
            
        except Exception as e:
            logger.error("Failed to store session vector", session_id=session_id, error=str(e))
            return False
    
    async def search_sessions(
        self,
        query_vector: List[float],
        user_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search sessions by vector similarity"""
        try:
            options = options or {}
            limit = options.get("limit", 10)
            score_threshold = options.get("scoreThreshold", 0.7)
            
            # Filter by user if specified
            filter_conditions = {"must": [{"key": "userId", "match": {"value": user_id}}]}
            
            search_results = self.client.search(
                collection_name=self.SESSIONS_COLLECTION,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold,
                query_filter=models.Filter(**filter_conditions)
            )
            
            results = []
            for result in search_results:
                results.append({
                    "id": str(result.id),
                    "score": float(result.score),
                    "payload": result.payload
                })
            
            logger.debug("Session search completed", user_id=user_id, results_count=len(results))
            return results
            
        except Exception as e:
            logger.error("Session search failed", user_id=user_id, error=str(e))
            return []
    
    async def store_document_chunk(
        self,
        chunk_id: str,
        vector: List[float],
        payload: Dict[str, Any]
    ) -> bool:
        """Store document chunk vector"""
        try:
            self.client.upsert(
                collection_name=self.CHUNKS_COLLECTION,
                points=[
                    models.PointStruct(
                        id=chunk_id,
                        vector=vector,
                        payload={
                            **payload,
                            "chunkId": chunk_id,
                            "type": "chunk"
                        }
                    )
                ]
            )
            
            logger.debug("Stored document chunk vector", chunk_id=chunk_id)
            return True
            
        except Exception as e:
            logger.error("Failed to store document chunk vector", chunk_id=chunk_id, error=str(e))
            return False
    
    async def search_document_chunks(
        self,
        query_vector: List[float],
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 10,
        score_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """Search document chunks by vector similarity"""
        try:
            filter_conditions = {"must": []}
            
            if document_id:
                filter_conditions["must"].append({"key": "documentId", "match": {"value": document_id}})
            
            if user_id:
                filter_conditions["must"].append({"key": "userId", "match": {"value": user_id}})
            
            search_results = self.client.search(
                collection_name=self.CHUNKS_COLLECTION,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold,
                query_filter=models.Filter(**filter_conditions) if filter_conditions["must"] else None
            )
            
            results = []
            for result in search_results:
                results.append({
                    "id": str(result.id),
                    "score": float(result.score),
                    "payload": result.payload
                })
            
            logger.debug("Document chunk search completed", results_count=len(results))
            return results
            
        except Exception as e:
            logger.error("Document chunk search failed", error=str(e))
            return []
    
    async def get_all_collections_info(self) -> Dict[str, Dict[str, Any]]:
        """Get information about all collections"""
        try:
            collections = self.client.get_collections()
            info = {}
            
            for collection in collections.collections:
                collection_info = self.client.get_collection(collection.name)
                info[collection.name] = {
                    "pointsCount": collection_info.points_count,
                    "vectorsCount": collection_info.vectors_count or 0,
                    "indexedVectorsCount": collection_info.indexed_vectors_count or 0,
                    "status": collection_info.status.value if collection_info.status else "unknown"
                }
            
            return info
            
        except Exception as e:
            logger.error("Failed to get collections info", error=str(e))
            return {}
    
    async def delete_collection(self, collection_name: str) -> bool:
        """Delete a collection"""
        try:
            self.client.delete_collection(collection_name)
            logger.warning("Deleted Qdrant collection", collection=collection_name)
            return True
            
        except Exception as e:
            logger.error("Failed to delete collection", collection=collection_name, error=str(e))
            return False
    
    async def initialize_medical_knowledge_collection(self) -> bool:
        """Initialize medical knowledge collection"""
        return await self._create_collection_if_not_exists(self.MEDICAL_KNOWLEDGE_COLLECTION)
    
    async def initialize_sessions_collection(self) -> bool:
        """Initialize sessions collection"""
        return await self._create_collection_if_not_exists(self.SESSIONS_COLLECTION)
    
    async def initialize_documents_collection(self) -> bool:
        """Initialize documents collection"""
        return await self._create_collection_if_not_exists(self.DOCUMENTS_COLLECTION)
    
    def get_source_reliability_score(self, url: str) -> float:
        """Get source reliability score based on URL"""
        # Simple implementation - in production, use more sophisticated scoring
        reliable_domains = [
            "pubmed.ncbi.nlm.nih.gov",
            "www.ncbi.nlm.nih.gov",
            "www.nejm.org",
            "www.thelancet.com",
            "jamanetwork.com",
            "www.nature.com",
            "www.bmj.com",
            "www.who.int",
            "www.cdc.gov",
            "www.nih.gov"
        ]
        
        for domain in reliable_domains:
            if domain in url:
                return 0.9
        
        if any(tld in url for tld in [".edu", ".gov"]):
            return 0.8
        
        if any(tld in url for tld in [".org"]):
            return 0.7
        
        return 0.5
