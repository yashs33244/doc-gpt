"""
Model Repository Service - Multi-provider AI model management
Handles interactions with OpenAI, Anthropic, and other AI providers
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Union

import structlog
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
import litellm

from app.core.config import settings

logger = structlog.get_logger(__name__)


class ModelUsage:
    """Model usage statistics"""
    
    def __init__(
        self,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0
    ):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens


class ModelResponse:
    """Model response wrapper"""
    
    def __init__(
        self,
        content: str,
        finish_reason: str = "stop",
        model: str = "",
        usage: Optional[ModelUsage] = None,
        response_time: float = 0.0,
        provider: str = ""
    ):
        self.content = content
        self.finish_reason = finish_reason
        self.model = model
        self.usage = usage or ModelUsage()
        self.response_time = response_time
        self.provider = provider
    
    def get(self, key: str, default=None):
        """Dictionary-like get method for compatibility"""
        return getattr(self, key, default)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "content": self.content,
            "finish_reason": self.finish_reason,
            "model": self.model,
            "usage": {
                "prompt_tokens": self.usage.prompt_tokens,
                "completion_tokens": self.usage.completion_tokens,
                "total_tokens": self.usage.total_tokens
            },
            "response_time": self.response_time,
            "provider": self.provider
        }


class MultiModelResponse:
    """Multi-model reasoning response"""
    
    def __init__(
        self,
        responses: List[Dict[str, Any]],
        final_response: Dict[str, Any],
        consensus: Dict[str, Any],
        total_cost: Dict[str, float]
    ):
        self.responses = responses
        self.final_response = final_response
        self.consensus = consensus
        self.total_cost = total_cost


class ModelRepositoryService:
    """Service for managing AI model interactions"""
    
    def __init__(self):
        self.openai_client = None
        self.anthropic_client = None
        self._initialize_clients()
    
    def _initialize_clients(self) -> None:
        """Initialize AI model clients"""
        try:
            if settings.has_openai:
                self.openai_client = ChatOpenAI(
                    api_key=settings.OPENAI_API_KEY,
                    model="gpt-4o-mini",
                    temperature=0.7
                )
                logger.info("OpenAI client initialized")
            
            if settings.has_anthropic:
                self.anthropic_client = ChatAnthropic(
                    api_key=settings.ANTHROPIC_API_KEY,
                    model="claude-3-5-sonnet-20241022",
                    temperature=0.7
                )
                logger.info("Anthropic client initialized")
                
        except Exception as e:
            logger.error("Failed to initialize model clients", error=str(e))
    
    async def complete(
        self,
        provider: str,
        messages: List[Dict[str, str]],
        options: Optional[Dict[str, Any]] = None
    ) -> ModelResponse:
        """Complete a conversation with specified provider"""
        start_time = time.time()
        
        try:
            if provider == "openai":
                return await self._complete_openai(messages, options or {})
            elif provider == "anthropic":
                return await self._complete_anthropic(messages, options or {})
            else:
                raise ValueError(f"Unsupported provider: {provider}. Available providers: {self.get_available_providers()}")
                
        except Exception as e:
            logger.error("Model completion failed", provider=provider, error=str(e))
            # Return error response
            return ModelResponse(
                content=f"I apologize, but I encountered an error: {str(e)}",
                finish_reason="error",
                model=f"{provider}-error",
                response_time=time.time() - start_time,
                provider=provider
            )
    
    async def _complete_openai(
        self,
        messages: List[Dict[str, str]],
        options: Dict[str, Any]
    ) -> ModelResponse:
        """Complete with OpenAI"""
        if not self.openai_client:
            raise ValueError("OpenAI client not available")
        
        start_time = time.time()
        
        # Convert messages to LangChain format
        langchain_messages = []
        for msg in messages:
            if msg["role"] == "system":
                langchain_messages.append(SystemMessage(content=msg["content"]))
            elif msg["role"] == "user":
                langchain_messages.append(HumanMessage(content=msg["content"]))
        
        try:
            # Create client with specific parameters for this request
            client = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                model=options.get("model", "gpt-4o-mini"),
                temperature=options.get("temperature", 0.7),
                max_tokens=options.get("maxTokens", 2000)
            )
            
            # Invoke the model
            response = await client.ainvoke(langchain_messages)
            
            # Calculate usage (approximation)
            prompt_tokens = sum(len(msg["content"].split()) for msg in messages)
            completion_tokens = len(response.content.split())
            
            return ModelResponse(
                content=response.content,
                finish_reason="stop",
                model=options.get("model", "gpt-4o-mini"),
                usage=ModelUsage(
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens
                ),
                response_time=time.time() - start_time,
                provider="openai"
            )
            
        except Exception as e:
            logger.error("OpenAI completion failed", error=str(e))
            raise
    
    async def _complete_anthropic(
        self,
        messages: List[Dict[str, str]],
        options: Dict[str, Any]
    ) -> ModelResponse:
        """Complete with Anthropic"""
        if not self.anthropic_client:
            raise ValueError("Anthropic client not available")
        
        start_time = time.time()
        
        # Convert messages to LangChain format
        langchain_messages = []
        for msg in messages:
            if msg["role"] == "system":
                langchain_messages.append(SystemMessage(content=msg["content"]))
            elif msg["role"] == "user":
                langchain_messages.append(HumanMessage(content=msg["content"]))
        
        try:
            # Create client with specific parameters for this request
            client = ChatAnthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                model=options.get("model", "claude-3-5-sonnet-20241022"),
                temperature=options.get("temperature", 0.7),
                max_tokens=options.get("maxTokens", 2000)
            )
            
            # Invoke the model
            response = await client.ainvoke(langchain_messages)
            
            # Calculate usage (approximation)
            prompt_tokens = sum(len(msg["content"].split()) for msg in messages)
            completion_tokens = len(response.content.split())
            
            return ModelResponse(
                content=response.content,
                finish_reason="stop",
                model=options.get("model", "claude-3-5-sonnet-20241022"),
                usage=ModelUsage(
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens
                ),
                response_time=time.time() - start_time,
                provider="anthropic"
            )
            
        except Exception as e:
            logger.error("Anthropic completion failed", error=str(e))
            raise
    
    
    async def multi_model_reasoning(
        self,
        messages: List[Dict[str, str]],
        options: Optional[Dict[str, Any]] = None,
        medical_context: Optional[Dict[str, Any]] = None,
        providers: Optional[List[str]] = None
    ) -> MultiModelResponse:
        """Perform multi-model reasoning with consensus building"""
        start_time = time.time()
        options = options or {}
        providers = providers or ["openai", "anthropic"]
        
        # Filter providers based on availability
        available_providers = []
        if "openai" in providers and settings.has_openai:
            available_providers.append("openai")
        if "anthropic" in providers and settings.has_anthropic:
            available_providers.append("anthropic")
        
        # Require at least one real provider
        if not available_providers:
            raise ValueError("No AI providers available. Please configure OpenAI or Anthropic API keys.")
        
        logger.info("Starting multi-model reasoning", providers=available_providers)
        
        # Get responses from all providers
        tasks = []
        for provider in available_providers:
            task = self.complete(provider, messages, options)
            tasks.append(task)
        
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process responses
        valid_responses = []
        for i, response in enumerate(responses):
            if isinstance(response, Exception):
                logger.error(
                    "Provider failed in multi-model reasoning",
                    provider=available_providers[i],
                    error=str(response)
                )
                continue
            
            valid_responses.append({
                "provider": response.provider,
                "model": response.model,
                "response": {
                    "content": response.content,
                    "finishReason": response.finish_reason,
                    "confidence": 0.8  # Default confidence
                },
                "responseTime": response.response_time,
                "cost": {
                    "inputCost": response.usage.prompt_tokens * 0.00000075,
                    "outputCost": response.usage.completion_tokens * 0.00000075,
                    "totalCost": response.usage.total_tokens * 0.00000075
                }
            })
        
        if not valid_responses:
            raise Exception("All providers failed in multi-model reasoning")
        
        # Build consensus (use first response as primary for now)
        primary_response = valid_responses[0]
        
        # Calculate total costs
        total_cost = {
            "inputCost": sum(r["cost"]["inputCost"] for r in valid_responses),
            "outputCost": sum(r["cost"]["outputCost"] for r in valid_responses),
            "totalCost": sum(r["cost"]["totalCost"] for r in valid_responses)
        }
        
        # Build final response
        final_response = {
            "content": primary_response["response"]["content"],
            "finishReason": primary_response["response"]["finishReason"],
            "model": primary_response["model"],
            "usage": {
                "promptTokens": sum(r["cost"]["inputCost"] / 0.00000075 for r in valid_responses),
                "completionTokens": sum(r["cost"]["outputCost"] / 0.00000075 for r in valid_responses),
                "totalTokens": sum(r["cost"]["totalCost"] / 0.00000075 for r in valid_responses)
            },
            "confidence": primary_response["response"]["confidence"],
            "medicalDisclaimer": "⚠️ This information is for educational purposes only and is not a substitute for professional medical advice.",
            "metadata": {
                "multiModel": True,
                "providersUsed": [r["provider"] for r in valid_responses],
                "consensusScore": 0.9,  # Placeholder
                "processingTime": time.time() - start_time
            }
        }
        
        # Build consensus information
        consensus = {
            "agreement": 0.9,  # Placeholder
            "confidence": 0.8,  # Placeholder
            "divergence": []    # Placeholder
        }
        
        logger.info(
            "Multi-model reasoning completed",
            providers_used=[r["provider"] for r in valid_responses],
            total_cost=total_cost["totalCost"],
            processing_time=time.time() - start_time
        )
        
        return MultiModelResponse(
            responses=valid_responses,
            final_response=final_response,
            consensus=consensus,
            total_cost=total_cost
        )
    
    def get_available_providers(self) -> List[str]:
        """Get list of available providers"""
        providers = []
        if settings.has_openai:
            providers.append("openai")
        if settings.has_anthropic:
            providers.append("anthropic")
        if not providers:
            raise ValueError("No AI providers configured. Please set up OpenAI or Anthropic API keys.")
        return providers
