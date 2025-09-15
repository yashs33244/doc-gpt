"""
Cost Tracking Service using LiteLLM
Handles cost tracking for all AI model interactions
"""

import json
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from litellm import completion_cost
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import CostLog, Operation

logger = structlog.get_logger(__name__)


class CostTrackingService:
    """Service for tracking AI model costs using LiteLLM"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def _ensure_user_exists(self, user_id: str) -> None:
        """Ensure user exists, create if not found"""
        try:
            from sqlalchemy import text
            from app.models import User
            
            # Check if user exists
            result = await self.db.execute(
                text("SELECT id FROM users WHERE id = :user_id"),
                {"user_id": user_id}
            )
            user = result.fetchone()
            
            if not user:
                # Create user
                new_user = User(
                    id=user_id,
                    email=f"user-{user_id}@doctorgpt.local",
                    name="Auto-created User"
                )
                self.db.add(new_user)
                await self.db.commit()
                
                logger.info("Auto-created user for cost tracking", user_id=user_id)
                
        except Exception as e:
            logger.warning("Failed to ensure user exists", user_id=user_id, error=str(e))
            # Don't raise, let the cost tracking continue and fail gracefully if needed
    
    async def track_cost(
        self,
        user_id: str,
        operation: str,
        provider: str,
        input_cost: float = 0.0,
        output_cost: float = 0.0,
        total_cost: float = 0.0,
        currency: str = "USD",
        session_id: Optional[str] = None,
        chat_id: Optional[str] = None,
        model: Optional[str] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Track cost for an operation"""
        try:
            # Validate operation type
            if isinstance(operation, str):
                # Convert string to Operation enum
                operation_enum = getattr(Operation, operation, Operation.API_CALL)
            else:
                operation_enum = operation
            
            # Ensure user exists before tracking cost
            await self._ensure_user_exists(user_id)
            
            # Create cost log entry
            cost_log = CostLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                chat_id=chat_id,
                operation=operation_enum,
                model_provider=provider,
                model_name=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost_usd=Decimal(str(total_cost)),
                metadata={
                    **(metadata or {}),
                    "sessionId": session_id,
                    "inputCost": input_cost,
                    "outputCost": output_cost,
                    "currency": currency,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
            
            self.db.add(cost_log)
            await self.db.commit()
            await self.db.refresh(cost_log)
            
            logger.info(
                "Cost tracked successfully",
                cost_log_id=cost_log.id,
                user_id=user_id,
                operation=operation,
                provider=provider,
                total_cost=total_cost
            )
            
            return cost_log.id
            
        except Exception as e:
            logger.error("Failed to track cost", error=str(e))
            # Don't re-raise to avoid breaking the main workflow
            return str(uuid.uuid4())  # Return dummy ID
    
    def calculate_cost_with_litellm(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        provider: Optional[str] = None
    ) -> Dict[str, float]:
        """Calculate cost using LiteLLM"""
        try:
            # Map provider/model combinations for LiteLLM
            litellm_model = self._map_to_litellm_model(provider, model)
            
            # Calculate cost using LiteLLM
            cost = completion_cost(
                model=litellm_model,
                prompt_tokens=input_tokens,
                completion_tokens=output_tokens
            )
            
            return {
                "input_cost": cost * (input_tokens / (input_tokens + output_tokens)) if (input_tokens + output_tokens) > 0 else 0,
                "output_cost": cost * (output_tokens / (input_tokens + output_tokens)) if (input_tokens + output_tokens) > 0 else 0,
                "total_cost": cost
            }
            
        except Exception as e:
            logger.warning("LiteLLM cost calculation failed, using fallback", error=str(e))
            return self._fallback_cost_calculation(provider, model, input_tokens, output_tokens)
    
    def _map_to_litellm_model(self, provider: Optional[str], model: str) -> str:
        """Map provider/model to LiteLLM format"""
        if provider == "openai":
            return f"openai/{model}"
        elif provider == "anthropic":
            return f"anthropic/{model}"
        else:
            return model
    
    def _fallback_cost_calculation(
        self,
        provider: Optional[str],
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> Dict[str, float]:
        """Fallback cost calculation when LiteLLM fails"""
        # Basic cost estimates (per 1K tokens)
        cost_per_1k_tokens = {
            "openai": {
                "gpt-4": {"input": 0.03, "output": 0.06},
                "gpt-4-turbo": {"input": 0.01, "output": 0.03},
                "gpt-4o": {"input": 0.005, "output": 0.015},
                "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
                "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015}
            },
            "anthropic": {
                "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
                "claude-3-sonnet-20240229": {"input": 0.003, "output": 0.015},
                "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
                "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125}
            }
        }
        
        provider_costs = cost_per_1k_tokens.get(provider, {})
        model_costs = provider_costs.get(model, {"input": 0.001, "output": 0.002})
        
        input_cost = (input_tokens / 1000) * model_costs["input"]
        output_cost = (output_tokens / 1000) * model_costs["output"]
        
        return {
            "input_cost": input_cost,
            "output_cost": output_cost,
            "total_cost": input_cost + output_cost
        }
    
    async def get_user_costs(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        operation: Optional[Operation] = None
    ) -> Dict[str, Any]:
        """Get cost summary for a user"""
        try:
            query = "SELECT * FROM cost_logs WHERE user_id = :user_id"
            params = {"user_id": user_id}
            
            if start_date:
                query += " AND created_at >= :start_date"
                params["start_date"] = start_date
            
            if end_date:
                query += " AND created_at <= :end_date"
                params["end_date"] = end_date
            
            if operation:
                query += " AND operation = :operation"
                params["operation"] = operation.value
            
            result = await self.db.execute(query, params)
            cost_logs = result.fetchall()
            
            if not cost_logs:
                return {
                    "totalCost": 0.0,
                    "totalLogs": 0,
                    "breakdown": {},
                    "operations": {}
                }
            
            # Calculate totals and breakdowns
            total_cost = sum(float(log.cost_usd) for log in cost_logs)
            
            # Breakdown by provider
            provider_breakdown = {}
            for log in cost_logs:
                provider = log.model_provider or "unknown"
                if provider not in provider_breakdown:
                    provider_breakdown[provider] = 0.0
                provider_breakdown[provider] += float(log.cost_usd)
            
            # Breakdown by operation
            operation_breakdown = {}
            for log in cost_logs:
                op = log.operation.value if log.operation else "unknown"
                if op not in operation_breakdown:
                    operation_breakdown[op] = 0.0
                operation_breakdown[op] += float(log.cost_usd)
            
            return {
                "totalCost": total_cost,
                "totalLogs": len(cost_logs),
                "breakdown": provider_breakdown,
                "operations": operation_breakdown,
                "period": {
                    "start": start_date.isoformat() if start_date else None,
                    "end": end_date.isoformat() if end_date else None
                }
            }
            
        except Exception as e:
            logger.error("Failed to get user costs", user_id=user_id, error=str(e))
            raise
    
    async def track_model_completion_cost(
        self,
        user_id: str,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        session_id: Optional[str] = None,
        chat_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Track cost for model completion using LiteLLM"""
        try:
            # Calculate cost using LiteLLM
            cost_info = self.calculate_cost_with_litellm(
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                provider=provider
            )
            
            # Track the cost
            cost_log_id = await self.track_cost(
                user_id=user_id,
                operation="CHAT_COMPLETION",
                provider=provider,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                input_cost=cost_info["input_cost"],
                output_cost=cost_info["output_cost"],
                total_cost=cost_info["total_cost"],
                session_id=session_id,
                chat_id=chat_id,
                metadata={
                    **(metadata or {}),
                    "costCalculationMethod": "litellm",
                    "modelUsed": model,
                    "providerUsed": provider
                }
            )
            
            return cost_log_id
            
        except Exception as e:
            logger.error("Failed to track model completion cost", error=str(e))
            raise
    
    async def get_cost_alerts(
        self,
        user_id: str,
        threshold: float = 10.0
    ) -> List[Dict[str, Any]]:
        """Get cost alerts for user"""
        try:
            # Get recent costs (last 24 hours)
            from datetime import timedelta
            start_time = datetime.utcnow() - timedelta(hours=24)
            
            costs = await self.get_user_costs(
                user_id=user_id,
                start_date=start_time
            )
            
            alerts = []
            
            if costs["totalCost"] > threshold:
                alerts.append({
                    "type": "daily_threshold_exceeded",
                    "message": f"Daily spending of ${costs['totalCost']:.4f} exceeds threshold of ${threshold:.2f}",
                    "severity": "warning",
                    "timestamp": datetime.utcnow().isoformat()
                })
            
            return alerts
            
        except Exception as e:
            logger.error("Failed to get cost alerts", user_id=user_id, error=str(e))
            return []
