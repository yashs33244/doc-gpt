"""
Medical Data Service
Handles medical knowledge ingestion, retrieval, and session document management
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MedicalKnowledge, MedicalReport, SessionFile, DocumentChunk
from app.services.qdrant_service import QdrantService
from app.utils.embeddings import generate_embeddings

logger = structlog.get_logger(__name__)


class MedicalDataService:
    """Service for managing medical data and knowledge"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.qdrant = QdrantService()
    
    async def query_medical_knowledge(
        self,
        query: str,
        user_id: str,
        session_id: str,
        use_global_knowledge: bool = True,
        use_session_documents: bool = True,
        medical_context: Optional[Dict[str, Any]] = None,
        uploaded_documents: Optional[List[Dict[str, Any]]] = None,
        limit: int = 10,
        score_threshold: float = 0.7
    ) -> Dict[str, Any]:
        """Query medical knowledge using dual RAG approach"""
        try:
            results = []
            
            # Generate query embedding
            query_vector = await generate_embeddings(query)
            
            # Search global medical knowledge if enabled
            if use_global_knowledge:
                global_results = await self.qdrant.search_medical_knowledge(
                    query_vector=query_vector,
                    limit=limit // 2,
                    score_threshold=score_threshold
                )
                results.extend(global_results)
            
            # Search session documents if enabled
            if use_session_documents:
                session_results = await self.qdrant.search_document_chunks(
                    query_vector=query_vector,
                    user_id=user_id,
                    limit=limit // 2,
                    score_threshold=score_threshold
                )
                results.extend(session_results)
            
            # If uploaded documents are provided directly, search them
            if uploaded_documents:
                for doc in uploaded_documents:
                    # Create temporary vectors for uploaded content
                    doc_vector = await generate_embeddings(doc.get("content", ""))
                    # Simple similarity check (in production, use proper vector similarity)
                    similarity = self._calculate_similarity(query_vector, doc_vector)
                    if similarity > score_threshold:
                        results.append({
                            "id": doc.get("id", str(uuid.uuid4())),
                            "score": similarity,
                            "payload": {
                                "content": doc.get("content", ""),
                                "source": "uploaded_document",
                                "fileName": doc.get("fileName", ""),
                                "metadata": doc
                            }
                        })
            
            # Sort by score and limit results
            results.sort(key=lambda x: x["score"], reverse=True)
            results = results[:limit]
            
            logger.info(
                "Medical knowledge query completed",
                user_id=user_id,
                session_id=session_id,
                results_count=len(results),
                query_length=len(query)
            )
            
            return {
                "success": True,
                "results": results,
                "query": query,
                "totalResults": len(results),
                "metadata": {
                    "useGlobalKnowledge": use_global_knowledge,
                    "useSessionDocuments": use_session_documents,
                    "hasUploadedDocuments": bool(uploaded_documents)
                }
            }
            
        except Exception as e:
            logger.error("Medical knowledge query failed", error=str(e))
            return {
                "success": False,
                "error": str(e),
                "results": [],
                "query": query,
                "totalResults": 0
            }
    
    async def ingest_medical_knowledge(
        self,
        title: str,
        content: str,
        source: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Ingest medical knowledge into the system"""
        try:
            knowledge_id = str(uuid.uuid4())
            
            # Create medical knowledge record
            medical_knowledge = MedicalKnowledge(
                id=knowledge_id,
                title=title,
                content=content,
                source=source,
                category=metadata.get("category", "general"),
                tags=metadata.get("tags", []),
                specialty=metadata.get("specialty"),
                trust_score=metadata.get("trustScore", 0.8),
                metadata=metadata or {}
            )
            
            self.db.add(medical_knowledge)
            await self.db.commit()
            await self.db.refresh(medical_knowledge)
            
            # Generate and store vector
            vector = await generate_embeddings(content)
            
            payload = {
                "id": knowledge_id,
                "title": title,
                "content": content,
                "source": source,
                "category": medical_knowledge.category,
                "tags": medical_knowledge.tags,
                "specialty": medical_knowledge.specialty,
                "trustScore": float(medical_knowledge.trust_score or 0.8),
                "createdAt": medical_knowledge.created_at.isoformat()
            }
            
            success = await self.qdrant.store_medical_knowledge(
                knowledge_id=knowledge_id,
                vector=vector,
                payload=payload
            )
            
            if success:
                logger.info("Medical knowledge ingested successfully", knowledge_id=knowledge_id)
                return {
                    "success": True,
                    "documentId": knowledge_id,
                    "vectorsStored": 1
                }
            else:
                raise Exception("Failed to store vector")
                
        except Exception as e:
            logger.error("Medical knowledge ingestion failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }
    
    async def ingest_session_document(
        self,
        session_id: str,
        user_id: str,
        document: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ingest session-specific document"""
        try:
            document_id = document.get("id", str(uuid.uuid4()))
            
            # Create session file record
            session_file = SessionFile(
                id=document_id,
                session_id=session_id,
                file_name=document.get("fileName", "unknown"),
                file_type=document.get("fileType", "text"),
                file_size=len(document.get("content", "")),
                extracted_text=document.get("extractedText", document.get("content", "")),
                summary=document.get("metadata", {}).get("summary"),
                tags=document.get("metadata", {}).get("medicalTags", []),
                processing_status="COMPLETED",
                uploaded_at=datetime.utcnow().isoformat(),
                metadata=document.get("metadata", {})
            )
            
            self.db.add(session_file)
            await self.db.commit()
            await self.db.refresh(session_file)
            
            # Generate chunks and vectors
            content = document.get("content", document.get("extractedText", ""))
            chunks = self._create_document_chunks(content, document_id, session_id, user_id)
            
            vectors_stored = 0
            for chunk in chunks:
                # Create chunk record
                document_chunk = DocumentChunk(
                    id=chunk["id"],
                    content=chunk["content"],
                    start_index=chunk["startIndex"],
                    end_index=chunk["endIndex"],
                    token_count=chunk["tokenCount"],
                    chunk_index=chunk["chunkIndex"],
                    semantic_section=chunk.get("semanticSection"),
                    metadata=chunk["metadata"],
                    session_file_id=document_id
                )
                
                self.db.add(document_chunk)
                
                # Generate and store vector
                vector = await generate_embeddings(chunk["content"])
                
                payload = {
                    "chunkId": chunk["id"],
                    "documentId": document_id,
                    "sessionId": session_id,
                    "userId": user_id,
                    "content": chunk["content"],
                    "chunkIndex": chunk["chunkIndex"],
                    "fileName": document.get("fileName", ""),
                    "source": "session_document",
                    "metadata": chunk["metadata"]
                }
                
                success = await self.qdrant.store_document_chunk(
                    chunk_id=chunk["id"],
                    vector=vector,
                    payload=payload
                )
                
                if success:
                    vectors_stored += 1
            
            await self.db.commit()
            
            logger.info(
                "Session document ingested successfully",
                document_id=document_id,
                chunks=len(chunks),
                vectors_stored=vectors_stored
            )
            
            return {
                "success": True,
                "documentId": document_id,
                "chunks": len(chunks),
                "vectorsStored": vectors_stored
            }
            
        except Exception as e:
            logger.error("Session document ingestion failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }
    
    async def search_medical_knowledge(
        self,
        query: str,
        limit: int = 10,
        score_threshold: float = 0.7,
        sources: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Search global medical knowledge"""
        try:
            query_vector = await generate_embeddings(query)
            
            # Add source filter if specified
            filter_conditions = None
            if sources:
                filter_conditions = {
                    "should": [{"key": "source", "match": {"value": source}} for source in sources]
                }
            
            results = await self.qdrant.search_medical_knowledge(
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold,
                filter_conditions=filter_conditions
            )
            
            return {
                "success": True,
                "results": results,
                "query": query,
                "totalResults": len(results)
            }
            
        except Exception as e:
            logger.error("Medical knowledge search failed", error=str(e))
            return {
                "success": False,
                "error": str(e),
                "results": [],
                "query": query,
                "totalResults": 0
            }
    
    def _create_document_chunks(
        self,
        content: str,
        document_id: str,
        session_id: str,
        user_id: str,
        chunk_size: int = 1000,
        overlap: int = 200
    ) -> List[Dict[str, Any]]:
        """Create document chunks for vector storage"""
        chunks = []
        content_length = len(content)
        
        start = 0
        chunk_index = 0
        
        while start < content_length:
            end = min(start + chunk_size, content_length)
            
            # Try to break at sentence boundaries
            if end < content_length:
                # Look for sentence endings within the last 100 characters
                sentence_end = content.rfind('.', start, end)
                if sentence_end > start + chunk_size - 100:
                    end = sentence_end + 1
            
            chunk_content = content[start:end].strip()
            
            if chunk_content:
                chunk_id = str(uuid.uuid4())
                
                chunks.append({
                    "id": chunk_id,
                    "content": chunk_content,
                    "startIndex": start,
                    "endIndex": end,
                    "tokenCount": len(chunk_content.split()),
                    "chunkIndex": chunk_index,
                    "semanticSection": None,  # Could be enhanced with NLP
                    "metadata": {
                        "documentId": document_id,
                        "sessionId": session_id,
                        "userId": user_id,
                        "chunkSize": len(chunk_content),
                        "createdAt": datetime.utcnow().isoformat()
                    }
                })
                
                chunk_index += 1
            
            # Move start position with overlap
            start = max(start + chunk_size - overlap, end)
            
            # Prevent infinite loop
            if start >= end:
                break
        
        return chunks
    
    def _calculate_similarity(self, vector1: List[float], vector2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            import numpy as np
            
            v1 = np.array(vector1)
            v2 = np.array(vector2)
            
            dot_product = np.dot(v1, v2)
            norm_v1 = np.linalg.norm(v1)
            norm_v2 = np.linalg.norm(v2)
            
            if norm_v1 == 0 or norm_v2 == 0:
                return 0.0
            
            similarity = dot_product / (norm_v1 * norm_v2)
            return float(similarity)
            
        except Exception:
            # Fallback to simple similarity
            return 0.5
