#!/usr/bin/env python3
"""
API Testing Script
Tests all migrated APIs to ensure they work correctly
"""

import asyncio
import json
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger(__name__)


class APITester:
    """Class for testing Doctor GPT APIs"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=60.0)
        
        # Fixed test IDs for consistency
        self.test_user_id = "550e8400-e29b-41d4-a716-446655440000"
        self.test_session_id = "550e8400-e29b-41d4-a716-446655440001"
        self.test_results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }
    
    def _log_test_result(self, test_name: str, success: bool, error: str = None):
        """Log test result and update counters"""
        if success:
            self.test_results["passed"] += 1
            logger.info(f"✅ {test_name}: PASSED")
        else:
            self.test_results["failed"] += 1
            error_msg = f"{test_name}: FAILED - {error or 'Unknown error'}"
            self.test_results["errors"].append(error_msg)
            logger.error(f"❌ {error_msg}")
    
    async def test_health_endpoints(self):
        """Test health check endpoints"""
        logger.info("🔄 Testing health endpoints...")
        
        endpoints = [
            "/health",
            "/api/v1/admin/health",
            "/api/v1/retrieval/health",
            "/api/v1/chat/doctor-gpt"  # GET endpoint for health check
        ]
        
        for endpoint in endpoints:
            try:
                response = await self.client.get(f"{self.base_url}{endpoint}")
                if response.status_code == 200:
                    data = response.json()
                    status = data.get('status', 'unknown')
                    self._log_test_result(f"Health check {endpoint}", True)
                    logger.info(f"   Status: {status}")
                else:
                    self._log_test_result(f"Health check {endpoint}", False, f"HTTP {response.status_code}")
            except Exception as e:
                self._log_test_result(f"Health check {endpoint}", False, str(e))
    
    async def test_qdrant_admin_endpoints(self):
        """Test Qdrant admin endpoints"""
        logger.info("🔄 Testing Qdrant admin endpoints...")
        
        try:
            # Test collections endpoint
            response = await self.client.get(f"{self.base_url}/api/v1/admin/qdrant/collections")
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    collections = data.get("collections", [])
                    logger.info(f"✅ Collections retrieved: {len(collections)} collections")
                    for collection in collections:
                        logger.info(f"   - {collection['name']}: {collection['pointsCount']} points")
                else:
                    logger.error(f"❌ Collections API returned error: {data.get('error')}")
            else:
                logger.error(f"❌ Collections endpoint: HTTP {response.status_code}")
        
        except Exception as e:
            logger.error(f"❌ Qdrant admin test failed: {str(e)}")
    
    async def test_document_upload(self):
        """Test document upload endpoint"""
        logger.info("🔄 Testing document upload endpoint...")
        
        try:
            # Create test document
            test_content = """
            Patient: John Doe
            Date: 2024-01-15
            
            Chief Complaint: Patient reports chest pain for the past 2 days.
            
            Physical Examination:
            - Blood pressure: 140/90 mmHg
            - Heart rate: 85 bpm
            - Temperature: 98.6°F
            
            Assessment:
            Patient presents with chest pain. Recommend further cardiac evaluation.
            
            Plan:
            1. ECG
            2. Chest X-ray
            3. Follow-up in 1 week
            """
            
            # Create form data
            files = {
                "file": ("test_medical_report.txt", test_content, "text/plain")
            }
            data = {
                "userId": self.test_user_id,
                "sessionId": self.test_session_id,
                "reportType": "consultation_note",
                "metadata": json.dumps({"test": True})
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/upload/medical-documents",
                files=files,
                data=data
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    doc = result.get("document", {})
                    logger.info(f"✅ Document uploaded successfully: {doc.get('id')}")
                    logger.info(f"   - File: {doc.get('fileName')}")
                    logger.info(f"   - Type: {doc.get('reportType')}")
                    logger.info(f"   - Size: {doc.get('fileSize')} bytes")
                    logger.info(f"   - Extracted text length: {len(doc.get('extractedText', ''))}")
                    return doc.get('id')
                else:
                    logger.error(f"❌ Upload failed: {result.get('error')}")
            else:
                logger.error(f"❌ Upload endpoint: HTTP {response.status_code}")
                logger.error(f"Response: {response.text}")
                
        except Exception as e:
            logger.error(f"❌ Document upload test failed: {str(e)}")
        
        return None
    
    async def test_retrieval_endpoints(self):
        """Test retrieval endpoints"""
        logger.info("🔄 Testing retrieval endpoints...")
        
        try:
            # Test document search
            search_data = {
                "query": "chest pain cardiac evaluation",
                "userId": self.test_user_id,
                "sessionId": self.test_session_id,
                "limit": 5,
                "scoreThreshold": 0.3
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/retrieval/search",
                json=search_data
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    results = result.get("results", [])
                    logger.info(f"✅ Document search: Found {len(results)} results")
                    for i, doc in enumerate(results[:3]):
                        logger.info(f"   {i+1}. Score: {doc.get('score', 0):.3f}, Source: {doc.get('source', 'unknown')}")
                else:
                    logger.error(f"❌ Search failed: {result.get('error')}")
            else:
                logger.error(f"❌ Search endpoint: HTTP {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Retrieval test failed: {str(e)}")
    
    async def test_chat_endpoint(self, uploaded_doc_id: str = None):
        """Test chat endpoint"""
        logger.info("🔄 Testing chat endpoint...")
        
        try:
            # Prepare chat request
            chat_data = {
                "messages": [
                    {
                        "role": "user",
                        "content": "What can you tell me about chest pain and when should someone see a doctor?"
                    }
                ],
                "userId": self.test_user_id,
                "sessionId": self.test_session_id,
                "show_intermediate_steps": False,
                "options": {
                    "enableMultiModel": True,
                    "enableWebSearch": False,
                    "enableCitations": True
                }
            }
            
            # Add uploaded document if available
            if uploaded_doc_id:
                chat_data["uploadedDocuments"] = [
                    {
                        "id": uploaded_doc_id,
                        "fileName": "test_medical_report.txt",
                        "extractedText": "Patient presents with chest pain. Recommend cardiac evaluation.",
                        "fileType": "text",
                        "fileSize": 65,
                        "summary": "Medical consultation note about chest pain",
                        "reportType": "consultation_note",
                        "processingStatus": "COMPLETED"
                    }
                ]
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/chat/doctor-gpt",
                json=chat_data
            )
            
            if response.status_code == 200:
                result = response.json()
                if "response" in result:
                    response_text = result.get("response", "")
                    confidence = result.get("confidence", 0)
                    citations = result.get("citations", [])
                    cost = result.get("cost", {}).get("totalCost", 0)
                    
                    self._log_test_result("Medical chat query", True)
                    logger.info(f"   - Response length: {len(response_text)} characters")
                    logger.info(f"   - Confidence: {confidence:.2f}")
                    logger.info(f"   - Citations: {len(citations)}")
                    logger.info(f"   - Cost: ${cost:.6f}")
                    logger.info(f"   - Preview: {response_text[:100]}...")
                else:
                    self._log_test_result("Medical chat query", False, f"Invalid response format: {result}")
            else:
                self._log_test_result("Medical chat query", False, f"HTTP {response.status_code} - {response.text[:200]}")
                
        except Exception as e:
            self._log_test_result("Medical chat query", False, str(e))
    
    async def test_non_medical_chat(self):
        """Test non-medical chat query"""
        logger.info("🔄 Testing non-medical chat endpoint...")
        
        try:
            # Test with a non-medical query
            chat_data = {
                "messages": [
                    {
                        "role": "user",
                        "content": "What's the weather like today?"
                    }
                ],
                "userId": self.test_user_id,
                "sessionId": self.test_session_id,
                "show_intermediate_steps": False
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/chat/doctor-gpt",
                json=chat_data
            )
            
            if response.status_code == 200:
                result = response.json()
                if "response" in result:
                    response_text = result.get("response", "")
                    self._log_test_result("Non-medical chat query", True)
                    logger.info(f"   - Response length: {len(response_text)} characters")
                    logger.info(f"   - Preview: {response_text[:100]}...")
                else:
                    self._log_test_result("Non-medical chat query", False, f"Invalid response format: {result}")
            else:
                self._log_test_result("Non-medical chat query", False, f"HTTP {response.status_code} - {response.text[:200]}")
                
        except Exception as e:
            self._log_test_result("Non-medical chat query", False, str(e))
    
    async def test_document_chat_integration(self):
        """Test chat with realistic uploaded document (like frontend sends)"""
        logger.info("🔄 Testing document + chat integration...")
        
        try:
            # Simulate realistic medical document data like the user's example
            medical_doc = {
                "id": "566ef8dc-12f4-4a17-b087-126d24787df5",
                "fileName": "medical_pet_scan_report.pdf",
                "fileType": "pdf",
                "fileSize": 271598,
                "extractedText": """OrderNo : DIRRGCI5308464 Order Date : 05-Sep-2025
Patient: VED PRAKASH, Age/Sex: 50 Years/M

DOTANOC PET/CT SCAN FINDINGS:
- Liver is enlarged with DOTANOC avid widespread lesions (highest SUV max 16.34)
- Evidence of neuroendocrine tumor progression
- Minimal bilateral pleural effusion noted
- Tracer avid lymph nodes in mesenteric region

IMPRESSION:
1. DOTA NOC avid widespread lesions in both lobes of enlarged liver
2. Tracer avid discrete lymph nodes at mesenteric region
3. Evidence of disease progression in known neuroendocrine tumor""",
                "summary": "PET scan showing progression of neuroendocrine tumor with liver metastasis",
                "reportType": "DIAGNOSTIC_IMAGE",
                "processingStatus": "COMPLETED"
            }
            
            # Test chat with document
            chat_data = {
                "messages": [
                    {
                        "role": "user",
                        "content": "Tell me about this medical report. What are the key findings and what do they mean?"
                    }
                ],
                "userId": self.test_user_id,
                "sessionId": self.test_session_id,
                "uploadedDocuments": [medical_doc],
                "show_intermediate_steps": False,
                "options": {
                    "enableMultiModel": True,
                    "enableWebSearch": False,
                    "enableCitations": True
                }
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/chat/doctor-gpt",
                json=chat_data
            )
            
            if response.status_code == 200:
                result = response.json()
                if "response" in result:
                    response_text = result.get("response", "")
                    confidence = result.get("confidence", 0)
                    has_docs = result.get("metadata", {}).get("hasUploadedDocuments", False)
                    docs_used = result.get("metadata", {}).get("documentsUsed", [])
                    
                    self._log_test_result("Document chat integration", True)
                    logger.info(f"   - Response length: {len(response_text)} characters")
                    logger.info(f"   - Confidence: {confidence:.2f}")
                    logger.info(f"   - Used uploaded docs: {has_docs}")
                    logger.info(f"   - Documents used: {docs_used}")
                    logger.info(f"   - Preview: {response_text[:150]}...")
                    
                    # Verify the response mentions the document content
                    if "liver" in response_text.lower() or "neuroendocrine" in response_text.lower() or "pet" in response_text.lower():
                        logger.info("   - ✅ Response appears to reference document content")
                    else:
                        logger.warning("   - ⚠️  Response may not be using document content")
                        
                else:
                    self._log_test_result("Document chat integration", False, f"Invalid response format: {result}")
            else:
                self._log_test_result("Document chat integration", False, f"HTTP {response.status_code} - {response.text[:200]}")
                
        except Exception as e:
            self._log_test_result("Document chat integration", False, str(e))
    
    def print_test_summary(self):
        """Print comprehensive test summary"""
        total_tests = self.test_results["passed"] + self.test_results["failed"]
        success_rate = (self.test_results["passed"] / total_tests * 100) if total_tests > 0 else 0
        
        print(f"\n{'='*60}")
        print("TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {self.test_results['passed']} ✅")
        print(f"Failed: {self.test_results['failed']} ❌")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.test_results["errors"]:
            print(f"\n{'='*60}")
            print("FAILED TESTS:")
            print(f"{'='*60}")
            for error in self.test_results["errors"]:
                print(f"❌ {error}")
        
        print(f"{'='*60}")
        
        # Log summary as well
        logger.info(f"Test suite completed: {self.test_results['passed']}/{total_tests} passed ({success_rate:.1f}%)")
        
        return success_rate >= 80  # Consider successful if 80% or more tests pass
    
    async def run_all_tests(self):
        """Run all API tests"""
        logger.info("🚀 Starting API tests...")
        logger.info("=" * 50)
        
        try:
            # Test basic health endpoints
            await self.test_health_endpoints()
            logger.info("")
            
            # Test Qdrant admin endpoints
            await self.test_qdrant_admin_endpoints()
            logger.info("")
            
            # Test document upload
            uploaded_doc_id = await self.test_document_upload()
            logger.info("")
            
            # Test retrieval endpoints
            await self.test_retrieval_endpoints()
            logger.info("")
            
            # Test chat endpoint (medical)
            await self.test_chat_endpoint(uploaded_doc_id)
            logger.info("")
            
            # Test non-medical chat
            await self.test_non_medical_chat()
            logger.info("")
            
            # Test document chat integration (key test for user's issue)
            await self.test_document_chat_integration()
            logger.info("")
            
            # Print comprehensive summary
            success = self.print_test_summary()
            
            if success:
                logger.info("🎉 API testing completed successfully!")
            else:
                logger.error("⚠️ API testing completed with failures!")
                
            return success
            
        except Exception as e:
            logger.error(f"💥 API testing failed: {str(e)}")
            self._log_test_result("Test suite execution", False, str(e))
            self.print_test_summary()
            raise
        
        finally:
            await self.client.aclose()


async def main():
    """Main testing function"""
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    else:
        base_url = "http://localhost:8000"
    
    logger.info(f"Testing APIs at: {base_url}")
    
    tester = APITester(base_url)
    
    try:
        success = await tester.run_all_tests()
        if not success:
            sys.exit(1)
    except Exception as e:
        logger.error(f"Test execution failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
