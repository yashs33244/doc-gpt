"""
Document Processor Service
Handles advanced document preprocessing and chunking
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DocumentChunk
from app.services.qdrant_service import QdrantService
from app.utils.embeddings import generate_embeddings

logger = structlog.get_logger(__name__)


class DocumentProcessorService:
    """Service for advanced document processing and preprocessing"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.qdrant = QdrantService()
    
    async def preprocess_document(
        self,
        document_id: str,
        text_content: str,
        metadata: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Preprocess document with advanced chunking and quality assessment"""
        start_time = datetime.now()
        
        try:
            logger.info("Starting document preprocessing", document_id=document_id)
            
            # Create enhanced chunks
            chunks = await self._create_enhanced_chunks(
                text_content=text_content,
                document_id=document_id,
                metadata=metadata,
                context=context or {}
            )
            
            if not chunks:
                return {
                    "success": False,
                    "error": "No valid chunks created from document",
                    "chunks": []
                }
            
            # Store chunks in database and vector store
            stored_chunks = []
            vectors_stored = 0
            
            for chunk_data in chunks:
                try:
                    # Create database record
                    chunk = DocumentChunk(
                        id=chunk_data["id"],
                        content=chunk_data["content"],
                        start_index=chunk_data["startIndex"],
                        end_index=chunk_data["endIndex"],
                        token_count=chunk_data["tokenCount"],
                        chunk_index=chunk_data["chunkIndex"],
                        semantic_section=chunk_data.get("semanticSection"),
                        metadata=chunk_data["metadata"],
                        quality_score=chunk_data.get("qualityScore", 0.8),
                        medical_report_id=metadata.get("medicalReportId"),
                        session_file_id=metadata.get("sessionFileId")
                    )
                    
                    self.db.add(chunk)
                    
                    # Generate and store vector
                    vector = await generate_embeddings(chunk_data["content"])
                    
                    payload = {
                        "chunkId": chunk_data["id"],
                        "documentId": document_id,
                        "content": chunk_data["content"],
                        "chunkIndex": chunk_data["chunkIndex"],
                        "qualityScore": chunk_data.get("qualityScore", 0.8),
                        "semanticSection": chunk_data.get("semanticSection"),
                        "source": "preprocessed_document",
                        "metadata": chunk_data["metadata"]
                    }
                    
                    success = await self.qdrant.store_document_chunk(
                        chunk_id=chunk_data["id"],
                        vector=vector,
                        payload=payload
                    )
                    
                    if success:
                        vectors_stored += 1
                        stored_chunks.append(chunk_data)
                    
                except Exception as chunk_error:
                    logger.warning("Failed to store chunk", chunk_id=chunk_data["id"], error=str(chunk_error))
            
            await self.db.commit()
            
            processing_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                "success": True,
                "chunks": stored_chunks,
                "vectorsStored": vectors_stored,
                "metadata": {
                    "totalChunks": len(chunks),
                    "storedChunks": len(stored_chunks),
                    "qualityScore": self._calculate_document_quality(stored_chunks),
                    "processingTime": processing_time,
                    "version": "1.2.0"
                },
                "cost": {
                    "total": len(stored_chunks) * 0.001,  # Approximate processing cost
                    "perChunk": 0.001
                }
            }
            
            logger.info(
                "Document preprocessing completed",
                document_id=document_id,
                chunks_created=len(stored_chunks),
                processing_time=processing_time
            )
            
            return result
            
        except Exception as e:
            logger.error("Document preprocessing failed", document_id=document_id, error=str(e))
            return {
                "success": False,
                "error": str(e),
                "chunks": [],
                "metadata": {
                    "processingTime": (datetime.now() - start_time).total_seconds(),
                    "version": "1.2.0"
                }
            }
    
    async def _create_enhanced_chunks(
        self,
        text_content: str,
        document_id: str,
        metadata: Dict[str, Any],
        context: Dict[str, Any],
        chunk_size: int = 1000,
        overlap: int = 200
    ) -> List[Dict[str, Any]]:
        """Create enhanced document chunks with semantic awareness"""
        chunks = []
        
        # Basic text preprocessing
        text_content = self._preprocess_text(text_content)
        
        if len(text_content.strip()) < 50:
            logger.warning("Text content too short for chunking", document_id=document_id)
            return []
        
        # Detect semantic sections
        sections = self._detect_semantic_sections(text_content, metadata.get("docType", "unknown"))
        
        if not sections:
            # Fallback to simple chunking
            sections = [{"content": text_content, "type": "content", "start": 0, "end": len(text_content)}]
        
        chunk_index = 0
        
        for section in sections:
            section_chunks = self._chunk_section(
                content=section["content"],
                section_type=section["type"],
                document_id=document_id,
                chunk_size=chunk_size,
                overlap=overlap,
                start_chunk_index=chunk_index
            )
            
            for chunk_data in section_chunks:
                # Calculate quality score
                quality_score = self._calculate_chunk_quality(chunk_data["content"], section["type"])
                
                chunk = {
                    "id": str(uuid.uuid4()),
                    "content": chunk_data["content"],
                    "startIndex": chunk_data["startIndex"],
                    "endIndex": chunk_data["endIndex"],
                    "tokenCount": len(chunk_data["content"].split()),
                    "chunkIndex": chunk_index,
                    "semanticSection": section["type"],
                    "qualityScore": quality_score,
                    "metadata": {
                        "documentId": document_id,
                        "sectionType": section["type"],
                        "chunkSize": len(chunk_data["content"]),
                        "userId": context.get("userId"),
                        "sessionId": context.get("sessionId"),
                        "createdAt": datetime.utcnow().isoformat(),
                        "docType": metadata.get("docType", "unknown"),
                        "processingVersion": "1.2.0"
                    }
                }
                
                # Only include high-quality chunks
                if quality_score >= 0.3:
                    chunks.append(chunk)
                
                chunk_index += 1
        
        return chunks
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for better chunking"""
        import re
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove control characters
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)
        
        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        return text.strip()
    
    def _detect_semantic_sections(self, text: str, doc_type: str) -> List[Dict[str, Any]]:
        """Detect semantic sections in the document"""
        sections = []
        
        # Simple section detection based on common medical document patterns
        if doc_type in ["lab_report", "medical_history"]:
            # Look for typical medical report sections
            section_patterns = [
                (r"(?i)patient\s+information", "patient_info"),
                (r"(?i)chief\s+complaint", "chief_complaint"),
                (r"(?i)history\s+of\s+present\s+illness", "hpi"),
                (r"(?i)physical\s+examination", "physical_exam"),
                (r"(?i)assessment\s+and\s+plan", "assessment"),
                (r"(?i)laboratory\s+results", "lab_results"),
                (r"(?i)medications", "medications"),
                (r"(?i)recommendations", "recommendations")
            ]
            
            last_end = 0
            for pattern, section_type in section_patterns:
                import re
                match = re.search(pattern, text[last_end:])
                if match:
                    start = last_end + match.start()
                    # Find next section or end of text
                    next_match = None
                    for next_pattern, _ in section_patterns:
                        next_match = re.search(next_pattern, text[start + 1:])
                        if next_match:
                            break
                    
                    end = start + next_match.start() + 1 if next_match else len(text)
                    
                    sections.append({
                        "content": text[start:end].strip(),
                        "type": section_type,
                        "start": start,
                        "end": end
                    })
                    last_end = end
        
        # If no sections detected, return whole text as content
        if not sections:
            sections = [{
                "content": text,
                "type": "content",
                "start": 0,
                "end": len(text)
            }]
        
        return sections
    
    def _chunk_section(
        self,
        content: str,
        section_type: str,
        document_id: str,
        chunk_size: int,
        overlap: int,
        start_chunk_index: int
    ) -> List[Dict[str, Any]]:
        """Chunk a semantic section"""
        chunks = []
        content_length = len(content)
        
        start = 0
        
        while start < content_length:
            end = min(start + chunk_size, content_length)
            
            # Try to break at sentence boundaries
            if end < content_length:
                sentence_end = content.rfind('.', start, end)
                if sentence_end > start + chunk_size - 100:
                    end = sentence_end + 1
            
            chunk_content = content[start:end].strip()
            
            if chunk_content and len(chunk_content) > 20:  # Minimum chunk size
                chunks.append({
                    "content": chunk_content,
                    "startIndex": start,
                    "endIndex": end
                })
            
            # Move start position with overlap
            start = max(start + chunk_size - overlap, end)
            
            # Prevent infinite loop
            if start >= end:
                break
        
        return chunks
    
    def _calculate_chunk_quality(self, content: str, section_type: str) -> float:
        """Calculate quality score for a chunk"""
        quality = 0.5  # Base quality
        
        # Length quality (prefer moderate length chunks)
        length = len(content)
        if 200 <= length <= 1500:
            quality += 0.2
        elif length < 50:
            quality -= 0.3
        
        # Content quality indicators
        sentence_count = content.count('.') + content.count('!') + content.count('?')
        if sentence_count >= 2:
            quality += 0.1
        
        # Medical content indicators
        medical_terms = ['patient', 'diagnosis', 'treatment', 'medication', 'symptoms', 'test', 'result']
        medical_term_count = sum(1 for term in medical_terms if term.lower() in content.lower())
        quality += min(medical_term_count * 0.05, 0.2)
        
        # Section type bonus
        if section_type in ["assessment", "lab_results", "medications"]:
            quality += 0.1
        
        return min(max(quality, 0.0), 1.0)
    
    def _calculate_document_quality(self, chunks: List[Dict[str, Any]]) -> float:
        """Calculate overall document quality score"""
        if not chunks:
            return 0.0
        
        quality_scores = [chunk.get("qualityScore", 0.5) for chunk in chunks]
        return sum(quality_scores) / len(quality_scores)
