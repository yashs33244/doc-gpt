"""
Doctor GPT Workflow Service
Orchestrates medical document processing, RAG retrieval, and multi-model reasoning
"""

import asyncio
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.model_repository import ModelRepositoryService
from app.services.medical_data import MedicalDataService
from app.services.cost_tracking import CostTrackingService

logger = structlog.get_logger(__name__)


class DoctorGPTWorkflowService:
    """Service for orchestrating Doctor GPT workflow"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.model_service = ModelRepositoryService()
        self.medical_service = MedicalDataService(db)
        self.cost_service = CostTrackingService(db)
    
    async def execute(self, workflow_state: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the complete Doctor GPT workflow"""
        start_time = time.time()
        
        try:
            logger.info("Starting Doctor GPT workflow execution")
            
            # Extract workflow parameters
            user_query = workflow_state.get("userQuery", "")
            user_id = workflow_state.get("userId", "")
            session_id = workflow_state.get("sessionId", "")
            chat_id = workflow_state.get("chatId", "")
            medical_context = workflow_state.get("medicalContext")
            uploaded_documents = workflow_state.get("uploadedDocuments", [])
            medical_query_result = workflow_state.get("medicalQueryResult", {})
            
            # Step 1: Query Analysis
            processed_query = await self._analyze_query(user_query, medical_context)
            
            # Step 2: Document Retrieval (already done in medical_query_result)
            retrieved_documents = medical_query_result.get("results", [])
            
            # Step 3: Web Search (if needed)
            search_results = []
            if processed_query.get("requiresCitation", False):
                search_results = await self._perform_web_search(user_query)
            
            # Step 4: Multi-Model Reasoning
            reasoning_result = await self._multi_model_reasoning(
                user_query=user_query,
                retrieved_documents=retrieved_documents,
                search_results=search_results,
                uploaded_documents=uploaded_documents,
                medical_context=medical_context
            )
            
            # Step 5: Response Validation and Enhancement
            final_response = await self._validate_and_enhance_response(
                reasoning_result,
                processed_query,
                user_query
            )
            
            # Step 6: Cost Tracking
            total_cost = await self._track_workflow_costs(
                user_id=user_id,
                session_id=session_id,
                chat_id=chat_id,
                reasoning_result=reasoning_result
            )
            
            execution_time = time.time() - start_time
            
            result = {
                "userQuery": user_query,
                "processedQuery": processed_query,
                "retrievedDocuments": retrieved_documents,
                "searchResults": search_results,
                "modelResponses": reasoning_result.get("responses", []),
                "finalResponse": final_response,
                "citations": self._extract_citations(retrieved_documents, search_results),
                "confidence": final_response.get("confidence", 0.8),
                "currentNode": "completed",
                "metadata": {
                    "executionTime": execution_time,
                    "totalWorkflowCost": total_cost,
                    "workflowVersion": "1.0.0",
                    "retrievedDocumentsCount": len(retrieved_documents),
                    "searchResultsCount": len(search_results),
                    "uploadedDocumentsCount": len(uploaded_documents)
                }
            }
            
            logger.info(
                "Doctor GPT workflow completed successfully",
                execution_time=execution_time,
                total_cost=total_cost,
                user_id=user_id
            )
            
            return result
            
        except Exception as e:
            logger.error("Doctor GPT workflow execution failed", error=str(e))
            execution_time = time.time() - start_time
            
            # Return error state
            return {
                "userQuery": workflow_state.get("userQuery", ""),
                "currentNode": "error",
                "error": str(e),
                "finalResponse": {
                    "content": "I apologize, but I encountered an issue processing your medical query. Please try rephrasing your question or consult with a healthcare professional for immediate assistance.",
                    "confidence": 0.1,
                    "medicalDisclaimer": "This is a system error response. Please consult a healthcare professional for medical advice."
                },
                "metadata": {
                    "executionTime": execution_time,
                    "totalWorkflowCost": 0.001,  # Small error cost
                    "workflowVersion": "1.0.0",
                    "errorOccurred": True
                }
            }
    
    async def _analyze_query(
        self,
        user_query: str,
        medical_context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze user query to determine intent and requirements"""
        try:
            # Simple query analysis - in production, use more sophisticated NLP
            query_length = len(user_query)
            
            # Detect intent
            intent = "general_medical"
            if any(keyword in user_query.lower() for keyword in ["symptom", "pain", "hurt"]):
                intent = "symptom_inquiry"
            elif any(keyword in user_query.lower() for keyword in ["medication", "drug", "prescription"]):
                intent = "medication_question"
            elif any(keyword in user_query.lower() for keyword in ["treatment", "therapy"]):
                intent = "treatment_options"
            elif any(keyword in user_query.lower() for keyword in ["analyze", "document", "report"]):
                intent = "document_analysis"
            
            # Determine if citations are required
            requires_citation = intent in ["treatment_options", "medication_question"] or "research" in user_query.lower()
            
            # Assess urgency
            urgency = "medium"
            if any(keyword in user_query.lower() for keyword in ["emergency", "urgent", "severe", "acute"]):
                urgency = "high"
            elif any(keyword in user_query.lower() for keyword in ["chest pain", "difficulty breathing"]):
                urgency = "emergency"
            
            return {
                "originalQuery": user_query,
                "intent": intent,
                "urgencyLevel": urgency,
                "requiresCitation": requires_citation,
                "queryLength": query_length,
                "medicalContext": medical_context,
                "confidence": 0.8
            }
            
        except Exception as e:
            logger.error("Query analysis failed", error=str(e))
            return {
                "originalQuery": user_query,
                "intent": "general_medical",
                "urgencyLevel": "medium",
                "requiresCitation": False,
                "confidence": 0.5
            }
    
    async def _perform_web_search(self, query: str) -> List[Dict[str, Any]]:
        """Perform web search for additional context"""
        try:
            # Placeholder for web search implementation
            # In production, integrate with Tavily or similar service
            logger.info("Web search requested but not implemented in this version")
            return []
            
        except Exception as e:
            logger.error("Web search failed", error=str(e))
            return []
    
    async def _multi_model_reasoning(
        self,
        user_query: str,
        retrieved_documents: List[Dict[str, Any]],
        search_results: List[Dict[str, Any]],
        uploaded_documents: List[Dict[str, Any]],
        medical_context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Perform multi-model reasoning with medical context"""
        try:
            # Prepare context for the models
            context_content = self._prepare_context(
                retrieved_documents=retrieved_documents,
                search_results=search_results,
                uploaded_documents=uploaded_documents
            )
            
            # Create enhanced system message for medical consultation
            system_message = self._create_medical_system_message(
                has_documents=bool(uploaded_documents),
                medical_context=medical_context
            )
            
            # Create user message with context
            user_message = self._create_contextual_user_message(
                user_query=user_query,
                context_content=context_content
            )
            
            messages = [
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ]
            
            # Execute multi-model reasoning
            result = await self.model_service.multi_model_reasoning(
                messages=messages,
                options={
                    "temperature": 0.7,
                    "maxTokens": 2000
                },
                medical_context=medical_context,
                providers=["openai", "anthropic"]
            )
            
            return {
                "responses": result.responses,
                "finalResponse": result.final_response,
                "consensus": result.consensus,
                "totalCost": result.total_cost
            }
            
        except Exception as e:
            logger.error("Multi-model reasoning failed", error=str(e))
            raise
    
    def _prepare_context(
        self,
        retrieved_documents: List[Dict[str, Any]],
        search_results: List[Dict[str, Any]],
        uploaded_documents: List[Dict[str, Any]]
    ) -> str:
        """Prepare context from all available sources"""
        context_parts = []
        
        # Add uploaded documents first (highest priority)
        if uploaded_documents:
            context_parts.append("=== UPLOADED DOCUMENTS ===")
            for i, doc in enumerate(uploaded_documents[:3]):  # Limit to 3 documents
                content = doc.get("content", doc.get("extractedText", ""))[:1000]  # Limit content
                context_parts.append(f"Document {i+1}: {doc.get('fileName', 'Unknown')}")
                context_parts.append(content)
                context_parts.append("")
        
        # Add retrieved documents from knowledge base
        if retrieved_documents:
            context_parts.append("=== RELEVANT MEDICAL KNOWLEDGE ===")
            for i, doc in enumerate(retrieved_documents[:5]):  # Limit to 5 documents
                payload = doc.get("payload", {})
                content = payload.get("content", "")[:500]  # Limit content
                source = payload.get("source", "Unknown")
                context_parts.append(f"Reference {i+1} (Source: {source}):")
                context_parts.append(content)
                context_parts.append("")
        
        # Add web search results
        if search_results:
            context_parts.append("=== WEB SEARCH RESULTS ===")
            for i, result in enumerate(search_results[:3]):  # Limit to 3 results
                content = result.get("content", result.get("snippet", ""))[:300]
                url = result.get("url", "")
                context_parts.append(f"Result {i+1} ({url}):")
                context_parts.append(content)
                context_parts.append("")
        
        return "\n".join(context_parts)
    
    def _create_medical_system_message(
        self,
        has_documents: bool,
        medical_context: Optional[Dict[str, Any]]
    ) -> str:
        """Create enhanced system message for medical consultation"""
        base_message = """You are a highly knowledgeable medical AI assistant with expertise in clinical medicine, diagnostics, and treatment guidelines. Your role is to provide accurate, evidence-based medical information while maintaining the highest standards of safety and professionalism.

CORE PRINCIPLES:
1. **Safety First**: Never provide direct diagnoses or definitive medical advice
2. **Evidence-Based**: Base responses on current medical literature and guidelines
3. **Professional Boundaries**: Always recommend consulting healthcare professionals for medical decisions
4. **Accuracy**: Provide precise, well-researched information
5. **Clarity**: Explain complex medical concepts in understandable terms

RESPONSE STRUCTURE:
1. **Analysis**: Break down the query systematically
2. **Information**: Provide relevant medical information with context
3. **Recommendations**: Suggest appropriate next steps or consultations
4. **Citations**: Reference sources when providing medical facts
5. **Disclaimer**: Include appropriate medical disclaimers"""
        
        if has_documents:
            base_message += """

DOCUMENT ANALYSIS MODE:
- Carefully analyze the uploaded medical documents
- Extract key findings, diagnoses, and recommendations
- Identify any concerning values or findings
- Provide context for medical terminology
- Suggest follow-up actions based on document content"""
        
        if medical_context:
            base_message += f"""

PATIENT CONTEXT:
- Consider the provided patient information in your response
- Tailor explanations to the patient's background
- Account for any mentioned medical history or current conditions"""
        
        base_message += """

CRITICAL SAFETY GUIDELINES:
- NEVER provide emergency medical advice - always direct to emergency services
- NEVER definitively diagnose conditions
- NEVER recommend specific medications or dosages
- ALWAYS encourage professional medical consultation
- ALWAYS include appropriate medical disclaimers

Remember: You are providing educational information to support informed medical discussions, not replacing professional medical care."""
        
        return base_message
    
    def _create_contextual_user_message(
        self,
        user_query: str,
        context_content: str
    ) -> str:
        """Create user message with context"""
        if context_content.strip():
            return f"""Based on the following context and documents:

{context_content}

Please answer this medical question: {user_query}

Provide a comprehensive response that:
1. Addresses the specific question asked
2. References relevant information from the provided documents
3. Explains any medical terms or concepts
4. Suggests appropriate next steps
5. Includes proper medical disclaimers"""
        else:
            return f"""Please answer this medical question: {user_query}

Provide a comprehensive response that:
1. Addresses the specific question asked
2. Provides evidence-based medical information
3. Explains any medical terms or concepts
4. Suggests appropriate next steps
5. Includes proper medical disclaimers"""
    
    async def _validate_and_enhance_response(
        self,
        reasoning_result: Dict[str, Any],
        processed_query: Dict[str, Any],
        user_query: str
    ) -> Dict[str, Any]:
        """Validate and enhance the final response"""
        try:
            final_response = reasoning_result.get("finalResponse", {})
            
            # Ensure medical disclaimer is present
            content = final_response.get("content", "")
            if not any(keyword in content.lower() for keyword in ["disclaimer", "professional", "doctor", "healthcare"]):
                content += "\n\n⚠️ **Medical Disclaimer**: This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of qualified healthcare providers with questions about medical conditions."
            
            # Enhance response with additional metadata
            enhanced_response = {
                **final_response,
                "content": content,
                "medicalDisclaimer": "⚠️ This information is for educational purposes only and is not a substitute for professional medical advice.",
                "queryType": processed_query.get("intent", "general_medical"),
                "urgencyLevel": processed_query.get("urgencyLevel", "medium"),
                "requiresFollowUp": processed_query.get("urgencyLevel") in ["high", "emergency"]
            }
            
            return enhanced_response
            
        except Exception as e:
            logger.error("Response validation failed", error=str(e))
            return reasoning_result.get("finalResponse", {})
    
    def _extract_citations(
        self,
        retrieved_documents: List[Dict[str, Any]],
        search_results: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Extract citations from retrieved documents and search results"""
        citations = []
        
        # Citations from retrieved documents
        for i, doc in enumerate(retrieved_documents):
            payload = doc.get("payload", {})
            citations.append({
                "id": f"doc-{i}",
                "title": payload.get("title", f"Medical Reference {i+1}"),
                "url": payload.get("sourceUrl", ""),
                "source": payload.get("source", "Medical Knowledge Base"),
                "snippet": payload.get("content", "")[:200] + "...",
                "relevanceScore": doc.get("score", 0.8)
            })
        
        # Citations from search results
        for i, result in enumerate(search_results):
            citations.append({
                "id": f"web-{i}",
                "title": result.get("title", f"Web Reference {i+1}"),
                "url": result.get("url", ""),
                "source": "Web Search",
                "snippet": result.get("content", result.get("snippet", ""))[:200] + "...",
                "relevanceScore": result.get("score", 0.7)
            })
        
        return citations
    
    async def _track_workflow_costs(
        self,
        user_id: str,
        session_id: str,
        chat_id: str,
        reasoning_result: Dict[str, Any]
    ) -> float:
        """Track costs for the entire workflow"""
        try:
            total_cost = reasoning_result.get("totalCost", {}).get("totalCost", 0.0)
            
            # Track the workflow cost
            await self.cost_service.track_cost(
                user_id=user_id,
                session_id=session_id,
                chat_id=chat_id,
                operation="MEDICAL_ANALYSIS",
                provider="workflow",
                total_cost=total_cost,
                metadata={
                    "workflowType": "doctor_gpt",
                    "modelProviders": [r.get("provider", "") for r in reasoning_result.get("responses", [])],
                    "responseCount": len(reasoning_result.get("responses", []))
                }
            )
            
            return total_cost
            
        except Exception as e:
            logger.error("Cost tracking failed", error=str(e))
            return 0.0

