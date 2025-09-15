"""
Chat API endpoints - Doctor GPT conversation handling
Enhanced chat endpoint with multi-model reasoning, RAG, and medical focus
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any, Union

import structlog
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.db.session import get_async_db
from app.models import User, Session, Chat, MessageRole
from app.services.doctor_gpt_workflow import DoctorGPTWorkflowService
from app.services.cost_tracking import CostTrackingService
from app.services.medical_data import MedicalDataService
from app.utils.medical import is_medical_related

logger = structlog.get_logger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    """Chat message model"""
    role: str = Field(..., description="Message role: user, assistant, system, function")
    content: str = Field(..., description="Message content")
    id: Optional[str] = Field(None, description="Message ID")


class UploadedDocument(BaseModel):
    """Uploaded document model - flexible to handle both content and extractedText"""
    model_config = {"extra": "allow"}
    
    id: str = Field(..., description="Document ID")
    fileName: str = Field(..., description="File name")
    # Make both content and extractedText optional to handle frontend compatibility
    content: Optional[str] = Field(None, description="Document content") 
    extractedText: Optional[str] = Field(None, description="Extracted text from document")
    fileType: Optional[str] = Field(None, description="File type")
    fileSize: Optional[int] = Field(None, description="File size in bytes")
    summary: Optional[str] = Field(None, description="Document summary")
    reportType: Optional[str] = Field(None, description="Report type")
    processingStatus: Optional[str] = Field(None, description="Processing status")
    
    def __init__(self, **data):
        """Custom initialization to handle content/extractedText compatibility"""
        # If content is missing but extractedText exists, use extractedText for content
        if not data.get('content') and data.get('extractedText'):
            data['content'] = data['extractedText']
        # If extractedText is missing but content exists, use content for extractedText
        elif not data.get('extractedText') and data.get('content'):
            data['extractedText'] = data['content']
        super().__init__(**data)
    
    @property
    def document_content(self) -> str:
        """Get document content, preferring extractedText over content"""
        return self.extractedText or self.content or ""


class MedicalContext(BaseModel):
    """Medical context information"""
    patientAge: Optional[int] = Field(None, description="Patient age")
    patientGender: Optional[str] = Field(None, description="Patient gender")
    medicalHistory: Optional[List[str]] = Field(None, description="Medical history")
    currentSymptoms: Optional[List[str]] = Field(None, description="Current symptoms")
    medications: Optional[List[str]] = Field(None, description="Current medications")
    allergies: Optional[List[str]] = Field(None, description="Known allergies")
    urgencyLevel: Optional[str] = Field(None, description="Urgency level")


class ChatOptions(BaseModel):
    """Chat options configuration"""
    enableMultiModel: bool = Field(True, description="Enable multi-model reasoning")
    enableWebSearch: bool = Field(True, description="Enable web search")
    enableCitations: bool = Field(True, description="Enable citations")
    maxCost: Optional[float] = Field(None, description="Maximum cost limit")


class ChatRequest(BaseModel):
    """Chat request model"""
    messages: List[ChatMessage] = Field(..., description="Chat messages")
    userId: Optional[str] = Field(None, description="User ID")
    sessionId: Optional[str] = Field(None, description="Session ID")
    medicalContext: Optional[MedicalContext] = Field(None, description="Medical context")
    uploadedDocuments: Optional[List[UploadedDocument]] = Field(None, description="Uploaded documents")
    show_intermediate_steps: bool = Field(False, description="Show intermediate processing steps")
    options: Optional[ChatOptions] = Field(None, description="Chat options")


class Citation(BaseModel):
    """Citation model"""
    id: str = Field(..., description="Citation ID")
    title: str = Field(..., description="Citation title")
    url: str = Field(..., description="Citation URL")
    source: str = Field(..., description="Citation source")
    snippet: Optional[str] = Field(None, description="Citation snippet")


class CostBreakdown(BaseModel):
    """Cost breakdown model"""
    models: float = Field(..., description="Model inference costs")
    search: float = Field(..., description="Search costs")
    workflow: float = Field(..., description="Workflow costs")


class ResponseMetadata(BaseModel):
    """Response metadata model"""
    modelProviders: List[str] = Field(..., description="Model providers used")
    responseTime: int = Field(..., description="Response time in milliseconds")
    workflowExecuted: bool = Field(..., description="Whether workflow was executed")
    hasUploadedDocuments: bool = Field(False, description="Whether uploaded documents were used")
    documentsUsed: List[str] = Field([], description="Names of documents used")


class ChatResponse(BaseModel):
    """Chat response model"""
    response: str = Field(..., description="Chat response content")
    citations: List[Citation] = Field([], description="Response citations")
    confidence: float = Field(..., description="Response confidence score")
    medicalDisclaimer: str = Field(..., description="Medical disclaimer")
    cost: Dict[str, float] = Field(..., description="Cost information")
    metadata: ResponseMetadata = Field(..., description="Response metadata")


class IntermediateStepsResponse(BaseModel):
    """Intermediate steps response model"""
    messages: List[ChatMessage] = Field(..., description="All messages including response")


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


async def create_or_get_session(db: AsyncSession, session_id: str, user_id: str, title: str) -> Session:
    """Create or get session by ID"""
    try:
        # Try to get existing session
        result = await db.execute(
            text("SELECT * FROM sessions WHERE id = :session_id"),
            {"session_id": session_id}
        )
        session = result.fetchone()
        
        if session:
            # Update last activity
            await db.execute(
                text("UPDATE sessions SET updated_at = :now WHERE id = :session_id"),
                {"now": datetime.utcnow(), "session_id": session_id}
            )
            await db.commit()
            return session
        
        # Create new session
        new_session = Session(
            id=session_id,
            user_id=user_id,
            title=title[:50] + "..." if len(title) > 50 else title,
            is_active=True,
            last_activity_at=datetime.utcnow().isoformat()
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        return new_session
        
    except Exception as e:
        logger.error("Failed to create or get session", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create or get session"
        )


@router.post("/doctor-gpt", response_model=ChatResponse)
async def doctor_gpt_chat(
    request: Request,
    db: AsyncSession = Depends(get_async_db)
) -> ChatResponse:
    """
    Doctor GPT Chat Endpoint
    Enhanced chat endpoint with multi-model reasoning, RAG, and medical focus
    """
    start_time = datetime.now()
    
    try:
        # Get raw JSON from request
        request_data = await request.json()
        
        # Preprocess request to handle document content/extractedText compatibility
        if "uploadedDocuments" in request_data and request_data["uploadedDocuments"]:
            for doc in request_data["uploadedDocuments"]:
                if isinstance(doc, dict):
                    content = doc.get("content")
                    extracted_text = doc.get("extractedText")
                    
                    # Ensure content field exists for pydantic validation
                    if not content and extracted_text:
                        doc["content"] = extracted_text
                    elif not extracted_text and content:
                        doc["extractedText"] = content
                    elif not content and not extracted_text:
                        doc["content"] = ""  # Empty content, will be validated later
        
        # Parse request with pydantic
        parsed_request = ChatRequest(**request_data)
        
        # Validate request
        if not parsed_request.messages or len(parsed_request.messages) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Messages are required"
            )
        
        current_message = parsed_request.messages[-1]
        if current_message.role != "user":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Last message must be from user"
            )
        
        # Validate and normalize uploaded documents
        if parsed_request.uploadedDocuments:
            for doc in parsed_request.uploadedDocuments:
                if not doc.document_content.strip():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Document {doc.fileName} has no content or extractedText"
                    )
                # Ensure both fields are populated for backward compatibility
                if not doc.content:
                    doc.content = doc.extractedText
                elif not doc.extractedText:
                    doc.extractedText = doc.content
        
        # Generate IDs if not provided
        actual_user_id = parsed_request.userId or str(uuid.uuid4())
        actual_session_id = parsed_request.sessionId or str(uuid.uuid4())
        chat_id = str(uuid.uuid4())
        
        logger.info(
            "Processing Doctor GPT request",
            user_id=actual_user_id,
            session_id=actual_session_id,
            message_length=len(current_message.content),
            has_documents=bool(parsed_request.uploadedDocuments)
        )
        
        # Check if this is a medical query or if there are uploaded documents
        is_medical_query = await is_medical_related(current_message.content)
        has_uploaded_documents = parsed_request.uploadedDocuments and len(parsed_request.uploadedDocuments) > 0
        
        if not is_medical_query and not has_uploaded_documents:
            # Create/get user and session before handling non-medical query
            user = await create_or_get_user(db, actual_user_id)
            session = await create_or_get_session(
                db, actual_session_id, actual_user_id, current_message.content
            )
            
            # Handle non-medical queries with simple model response
            return await handle_non_medical_query(
                current_message.content,
                actual_user_id,
                actual_session_id,
                chat_id,
                db
            )
        
        # Create/get user and session
        user = await create_or_get_user(db, actual_user_id)
        session = await create_or_get_session(
            db, actual_session_id, actual_user_id, current_message.content
        )
        
        # Create initial chat record
        await create_initial_chat_record(
            db, actual_user_id, actual_session_id, chat_id, current_message.content
        )
        
        # Initialize services
        workflow_service = DoctorGPTWorkflowService(db)
        medical_service = MedicalDataService(db)
        
        # Query medical knowledge using dual RAG with uploaded documents
        logger.info(
            "Querying medical knowledge",
            uploaded_documents_count=len(parsed_request.uploadedDocuments or [])
        )
        
        medical_query_result = await medical_service.query_medical_knowledge(
            query=current_message.content,
            user_id=actual_user_id,
            session_id=actual_session_id,
            use_global_knowledge=True,
            use_session_documents=has_uploaded_documents,
            medical_context=parsed_request.medicalContext.dict() if parsed_request.medicalContext else None,
            uploaded_documents=[doc.dict() for doc in parsed_request.uploadedDocuments] if parsed_request.uploadedDocuments else None
        )
        
        # Execute the workflow with medical context
        workflow_state = {
            "userQuery": current_message.content,
            "userId": actual_user_id,
            "sessionId": actual_session_id,
            "chatId": chat_id,
            "medicalContext": parsed_request.medicalContext.dict() if parsed_request.medicalContext else None,
            "uploadedDocuments": [
                {
                    "id": doc.id,
                    "fileName": doc.fileName,
                    "fileType": doc.fileType or "unknown",
                    "content": doc.document_content,
                    "extractedText": doc.document_content,
                    "processingStatus": doc.processingStatus or "completed",
                    "summary": doc.summary,
                    "reportType": doc.reportType
                }
                for doc in parsed_request.uploadedDocuments
            ] if parsed_request.uploadedDocuments else None,
            "medicalQueryResult": medical_query_result
        }
        
        result = await workflow_service.execute(workflow_state)
        
        # Update chat record with final response
        await update_chat_with_response(
            db, actual_user_id, actual_session_id, chat_id, result
        )
        
        # Prepare response
        response_content = (
            result.get("finalResponse", {}).get("content") or
            (result.get("modelResponses", [{}])[0].get("response", {}).get("content") if result.get("modelResponses") else None) or
            "I apologize, but I encountered an issue processing your request. Please try again or rephrase your question."
        )
        
        response = ChatResponse(
            response=response_content,
            citations=result.get("citations", []),
            confidence=result.get("confidence", 0.5),
            medicalDisclaimer=result.get("finalResponse", {}).get("medicalDisclaimer") or 
                            "⚠️ This information is for educational purposes only and is not a substitute for professional medical advice.",
            cost={
                "totalCost": float(result.get("metadata", {}).get("totalWorkflowCost", 0.0)),
                "models": float(sum(r.get("cost", 0) for r in result.get("modelResponses", []) if isinstance(r.get("cost", 0), (int, float)))),
                "search": 0.001,  # Approximate search cost
                "workflow": 0.001  # Base workflow cost
            },
            metadata=ResponseMetadata(
                modelProviders=[r.get("provider", "") for r in result.get("modelResponses", [])],
                responseTime=int((datetime.now() - start_time).total_seconds() * 1000),
                workflowExecuted=True,
                hasUploadedDocuments=bool(has_uploaded_documents) if has_uploaded_documents is not None else False,
                documentsUsed=[doc.fileName for doc in parsed_request.uploadedDocuments] if parsed_request.uploadedDocuments else []
            )
        )
        
        # Handle intermediate steps response format
        if parsed_request.show_intermediate_steps:
            response_messages = [
                *parsed_request.messages,
                ChatMessage(
                    id="assistant-response",
                    role="assistant",
                    content=response.response
                )
            ]
            return {"messages": response_messages}
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Doctor GPT API error", error=str(e), exc_info=True)
        
        # Track error cost
        try:
            cost_service = CostTrackingService(db)
            await cost_service.track_cost(
                user_id="unknown",
                operation="CHAT_COMPLETION",
                provider="error",
                input_cost=0,
                output_cost=0.001,
                total_cost=0.001,
                currency="USD",
                metadata={
                    "error": str(e),
                    "endpoint": "/api/v1/chat/doctor-gpt"
                }
            )
        except Exception as cost_error:
            logger.error("Failed to track error cost", error=str(cost_error))
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process medical query" if not settings.is_development else str(e)
        )


async def handle_non_medical_query(
    query: str,
    user_id: str,
    session_id: str,
    chat_id: str,
    db: AsyncSession
) -> ChatResponse:
    """Handle non-medical queries with a simple model response"""
    try:
        from app.services.model_repository import ModelRepositoryService
        
        model_service = ModelRepositoryService()
        
        response = await model_service.complete(
            provider="openai",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant. If asked about medical topics, politely redirect to seek professional medical advice."
                },
                {
                    "role": "user",
                    "content": query
                }
            ]
        )
        
        # Track cost for non-medical query (no chat_id since no chat record created)
        cost_service = CostTrackingService(db)
        await cost_service.track_cost(
            user_id=user_id,
            session_id=session_id,
            chat_id=None,  # No chat record created for non-medical queries
            operation="MODEL_INFERENCE",
            provider="openai",
            model="gpt-4o-mini",
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            total_tokens=response.usage.total_tokens,
            input_cost=response.usage.prompt_tokens * 0.00000015,
            output_cost=response.usage.completion_tokens * 0.0000006,
            total_cost=response.usage.total_tokens * 0.00000075,
            currency="USD",
            metadata={
                "model": "gpt-4o-mini",
                "provider": "openai",
                "queryType": "non-medical"
            }
        )
        
        return ChatResponse(
            response=response.content,
            citations=[],
            confidence=0.8,
            medicalDisclaimer="For medical questions, please consult with a healthcare professional.",
            cost={
                "totalCost": float(response.usage.total_tokens * 0.00000075),
                "models": float(response.usage.total_tokens * 0.00000075),
                "search": 0.0,
                "workflow": 0.0
            },
            metadata=ResponseMetadata(
                modelProviders=["openai"],
                responseTime=0,
                workflowExecuted=False,
                hasUploadedDocuments=False,
                documentsUsed=[]
            )
        )
        
    except Exception as e:
        logger.error("Non-medical query handling failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process query"
        )


async def create_initial_chat_record(
    db: AsyncSession,
    user_id: str,
    session_id: str,
    chat_id: str,
    user_message: str
) -> None:
    """Create initial chat record"""
    try:
        # Save user message
        user_chat = Chat(
            id=chat_id,  # Use the passed chat_id instead of generating a new one
            session_id=session_id,
            user_id=user_id,
            role=MessageRole.USER,
            content=user_message,
            is_healthcare_query=True,
            metadata={
                "originalQuery": user_message,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        db.add(user_chat)
        await db.commit()
        
    except Exception as e:
        logger.error("Failed to create initial chat record", error=str(e))


async def update_chat_with_response(
    db: AsyncSession,
    user_id: str,
    session_id: str,
    chat_id: str,
    workflow_result: Dict[str, Any]
) -> None:
    """Update chat record with response"""
    try:
        # Extract response content
        response_content = (
            workflow_result.get("finalResponse", {}).get("content") or
            (workflow_result.get("modelResponses", [{}])[0].get("response", {}).get("content") if workflow_result.get("modelResponses") else None) or
            "I apologize, but I encountered an issue processing your request. Please try again."
        )
        
        if response_content:
            assistant_chat = Chat(
                id=str(uuid.uuid4()),
                session_id=session_id,
                user_id=user_id,
                role=MessageRole.ASSISTANT,
                content=response_content,
                is_healthcare_query=True,
                citations=workflow_result.get("citations", []),
                confidence=workflow_result.get("confidence", 0.5),
                metadata={
                    "modelProviders": [r.get("provider", "") for r in workflow_result.get("modelResponses", [])],
                    "totalCost": workflow_result.get("metadata", {}).get("totalWorkflowCost", 0),
                    "workflowExecuted": True,
                    "responseTime": workflow_result.get("metadata", {}).get("executionTime", 0),
                    "citationCount": len(workflow_result.get("citations", [])),
                    "timestamp": datetime.utcnow().isoformat(),
                    "hasUploadedDocuments": len(workflow_result.get("uploadedDocuments", [])) > 0,
                    "workflowState": workflow_result.get("currentNode", "completed")
                }
            )
            db.add(assistant_chat)
            await db.commit()
            
            logger.info("Successfully saved assistant response to database")
            
    except Exception as e:
        logger.error("Failed to update chat with response", error=str(e))


@router.get("/doctor-gpt")
async def doctor_gpt_health():
    """Health check endpoint for Doctor GPT API"""
    return {
        "status": "healthy",
        "service": "doctor-gpt-chat-api",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }
