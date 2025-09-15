"""
File processing utilities for medical documents
Handles text extraction, OCR, and document processing
"""

import asyncio
import io
import subprocess
from typing import Dict, List, Any, Tuple

import structlog
from PIL import Image

logger = structlog.get_logger(__name__)


async def extract_text_from_file(file_content: bytes, file_type: str) -> Dict[str, Any]:
    """Extract text from uploaded file based on file type"""
    try:
        extracted_text = ""
        extraction_cost = 0.0005  # Base extraction cost
        
        if file_type == "txt":
            extracted_text = file_content.decode('utf-8')
        elif file_type == "pdf":
            extracted_text, extraction_cost = await extract_text_from_pdf(file_content)
        elif file_type == "docx":
            extracted_text, extraction_cost = await extract_text_from_docx(file_content)
        elif file_type in ["jpg", "png", "gif"]:
            extracted_text, extraction_cost = await extract_text_from_image(file_content, file_type)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        if not extracted_text.strip():
            raise ValueError("No text could be extracted from the file")
        
        return {
            "extractedText": extracted_text.strip(),
            "extractionCost": extraction_cost
        }
        
    except Exception as e:
        logger.error(f"Text extraction failed for {file_type}", error=str(e))
        raise


async def extract_text_from_pdf(file_content: bytes) -> Tuple[str, float]:
    """Extract text from PDF using multiple strategies"""
    try:
        # Try PyPDF2 first
        import PyPDF2
        
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text_pages = []
        
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text.strip():
                text_pages.append(text)
        
        if text_pages:
            extracted_text = "\n\n".join(text_pages)
            if len(extracted_text.strip()) > 100:  # Ensure we got meaningful content
                return extracted_text, 0.001
        
        # Fallback to OCR if direct extraction fails
        logger.info("PDF direct extraction failed, trying OCR")
        return await extract_text_from_pdf_ocr(file_content)
        
    except Exception as e:
        logger.error("PDF extraction failed", error=str(e))
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")


async def extract_text_from_pdf_ocr(file_content: bytes) -> Tuple[str, float]:
    """Extract text from PDF using OCR (fallback method)"""
    try:
        # Convert PDF to images using pdf2image (requires poppler)
        from pdf2image import convert_from_bytes
        import pytesseract
        
        # Convert PDF to images
        images = convert_from_bytes(file_content, dpi=300, first_page=1, last_page=5)  # Limit to 5 pages
        
        extracted_texts = []
        for i, image in enumerate(images):
            try:
                # Use Tesseract OCR
                text = pytesseract.image_to_string(image, lang='eng')
                if text.strip():
                    extracted_texts.append(f"=== Page {i+1} ===\n{text.strip()}")
            except Exception as page_error:
                logger.warning(f"OCR failed for page {i+1}", error=str(page_error))
        
        if extracted_texts:
            return "\n\n".join(extracted_texts), 0.002  # Higher cost for OCR
        else:
            raise ValueError("OCR extraction found no text")
            
    except ImportError:
        raise ValueError("PDF OCR requires pdf2image and pytesseract libraries")
    except Exception as e:
        logger.error("PDF OCR extraction failed", error=str(e))
        raise ValueError(f"OCR extraction failed: {str(e)}")


async def extract_text_from_docx(file_content: bytes) -> Tuple[str, float]:
    """Extract text from DOCX file"""
    try:
        from docx import Document
        
        doc = Document(io.BytesIO(file_content))
        paragraphs = []
        
        for para in doc.paragraphs:
            if para.text.strip():
                paragraphs.append(para.text)
        
        if paragraphs:
            return "\n".join(paragraphs), 0.001
        else:
            raise ValueError("No text found in DOCX file")
            
    except ImportError:
        raise ValueError("DOCX extraction requires python-docx library")
    except Exception as e:
        logger.error("DOCX extraction failed", error=str(e))
        raise ValueError(f"Failed to extract text from DOCX: {str(e)}")


async def extract_text_from_image(file_content: bytes, file_type: str) -> Tuple[str, float]:
    """Extract text from image using OCR"""
    try:
        import pytesseract
        
        # Open image
        image = Image.open(io.BytesIO(file_content))
        
        # Ensure image is in RGB mode
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Use Tesseract OCR
        text = pytesseract.image_to_string(image, lang='eng')
        
        if text.strip():
            return text.strip(), 0.002  # OCR cost
        else:
            raise ValueError("No text found in image")
            
    except ImportError:
        raise ValueError("Image OCR requires pytesseract library")
    except Exception as e:
        logger.error("Image OCR extraction failed", error=str(e))
        raise ValueError(f"Failed to extract text from image: {str(e)}")


async def generate_document_summary(text: str, user_id: str) -> Dict[str, Any]:
    """Generate document summary using AI"""
    try:
        from app.services.model_repository import ModelRepositoryService
        
        model_service = ModelRepositoryService()
        
        response = await model_service.complete(
            provider="openai",
            messages=[
                {
                    "role": "system",
                    "content": "You are a medical document summarizer. Create a concise, accurate summary of the medical document. Focus on key findings, diagnoses, treatments, and recommendations. Keep it under 200 words."
                },
                {
                    "role": "user",
                    "content": f"Please summarize this medical document:\n\n{text[:3000]}..."  # Limit input length
                }
            ],
            options={"maxTokens": 200, "temperature": 0.3}
        )
        
        cost = response.usage.total_tokens * 0.00000075  # Average cost
        
        return {
            "summary": response.content,
            "cost": cost
        }
        
    except Exception as e:
        logger.error("Summary generation failed", error=str(e))
        return {
            "summary": "Summary generation failed",
            "cost": 0.0
        }


async def detect_report_type(text: str, user_id: str) -> Dict[str, Any]:
    """Detect report type using AI"""
    try:
        from app.services.model_repository import ModelRepositoryService
        
        model_service = ModelRepositoryService()
        
        response = await model_service.complete(
            provider="openai",
            messages=[
                {
                    "role": "system",
                    "content": """You are a medical document classifier. Classify the document type based on its content.

Choose from these types:
- lab_report: Laboratory test results, blood work, pathology reports
- prescription: Medication prescriptions, pharmacy records
- diagnostic_image: Radiology reports, imaging studies, X-ray reports
- medical_history: Patient history, previous conditions, family history
- discharge_summary: Hospital discharge summaries, treatment summaries
- consultation_note: Doctor visits, consultation notes, progress notes
- other: Any other medical document

Respond with only the type name (e.g., "lab_report")."""
                },
                {
                    "role": "user",
                    "content": f"Classify this medical document:\n\n{text[:1000]}..."
                }
            ],
            options={"maxTokens": 10, "temperature": 0.1}
        )
        
        detected_type = response.content.strip().lower()
        valid_types = ["lab_report", "prescription", "diagnostic_image", "medical_history", 
                      "discharge_summary", "consultation_note", "other"]
        report_type = detected_type if detected_type in valid_types else "other"
        
        cost = response.usage.total_tokens * 0.00000075
        
        return {
            "reportType": report_type,
            "cost": cost
        }
        
    except Exception as e:
        logger.error("Report type detection failed", error=str(e))
        return {
            "reportType": "other",
            "cost": 0.0
        }


async def extract_medical_tags(text: str) -> List[str]:
    """Extract medical tags from document text"""
    # Simple keyword-based tagging
    # In production, this would use NLP models
    medical_keywords = [
        'blood pressure', 'diabetes', 'cholesterol', 'heart rate', 'temperature',
        'medication', 'prescription', 'dosage', 'treatment', 'diagnosis',
        'symptoms', 'pain', 'fever', 'infection', 'allergy', 'test results',
        'x-ray', 'mri', 'ct scan', 'ultrasound', 'biopsy', 'surgery',
        'lab results', 'pathology', 'radiology', 'cardiology', 'oncology'
    ]
    
    lower_text = text.lower()
    found_tags = [keyword for keyword in medical_keywords if keyword in lower_text]
    
    return found_tags[:10]  # Limit to 10 tags


def get_extraction_method(file_type: str) -> str:
    """Get extraction method name for metadata"""
    methods = {
        'txt': 'direct_text',
        'pdf': 'pdf_parsing',
        'docx': 'docx_parsing',
        'jpg': 'ocr_tesseract',
        'png': 'ocr_tesseract',
        'gif': 'ocr_tesseract'
    }
    
    return methods.get(file_type, 'unknown')

