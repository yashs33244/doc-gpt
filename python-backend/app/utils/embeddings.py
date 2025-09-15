"""
Embeddings utility functions
Handles text embedding generation for vector search
"""

from typing import List
import structlog
from app.core.config import settings

logger = structlog.get_logger(__name__)


async def generate_embeddings(text: str) -> List[float]:
    """Generate embeddings for text using OpenAI or fallback"""
    try:
        if settings.has_openai:
            return await _generate_openai_embeddings(text)
        else:
            # Fallback to dummy embeddings for development
            logger.warning("No embedding provider available, using dummy embeddings")
            return _generate_dummy_embeddings(text)
            
    except Exception as e:
        logger.error("Embedding generation failed", error=str(e))
        return _generate_dummy_embeddings(text)


async def _generate_openai_embeddings(text: str) -> List[float]:
    """Generate embeddings using OpenAI"""
    try:
        from langchain_openai import OpenAIEmbeddings
        
        embeddings = OpenAIEmbeddings(
            openai_api_key=settings.OPENAI_API_KEY,
            model="text-embedding-ada-002"
        )
        
        # Generate embedding
        embedding = await embeddings.aembed_query(text)
        return embedding
        
    except Exception as e:
        logger.error("OpenAI embedding generation failed", error=str(e))
        raise


def _generate_dummy_embeddings(text: str) -> List[float]:
    """Generate dummy embeddings for development/testing"""
    import hashlib
    import struct
    
    # Create deterministic "embeddings" based on text hash
    text_hash = hashlib.md5(text.encode()).hexdigest()
    
    # Convert hash to float values
    embeddings = []
    for i in range(0, len(text_hash), 8):
        chunk = text_hash[i:i+8]
        if len(chunk) == 8:
            # Convert hex to int, then to normalized float
            int_val = int(chunk, 16)
            float_val = (int_val / 0xFFFFFFFF) * 2 - 1  # Normalize to [-1, 1]
            embeddings.append(float_val)
    
    # Pad or truncate to required size
    while len(embeddings) < settings.VECTOR_DIMENSIONS:
        embeddings.extend(embeddings[:min(len(embeddings), settings.VECTOR_DIMENSIONS - len(embeddings))])
    
    return embeddings[:settings.VECTOR_DIMENSIONS]

