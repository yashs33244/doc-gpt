"""
Medical utilities and helper functions
"""

import re
from typing import List


async def is_medical_related(query: str) -> bool:
    """
    Determine if a query is medical-related
    """
    medical_keywords = [
        'symptom', 'symptoms', 'pain', 'hurt', 'ache', 'fever', 'temperature',
        'medication', 'medicine', 'drug', 'prescription', 'dosage',
        'doctor', 'physician', 'hospital', 'clinic', 'medical',
        'diagnosis', 'treatment', 'therapy', 'surgery', 'operation',
        'health', 'wellness', 'sick', 'illness', 'disease', 'condition',
        'blood', 'pressure', 'heart', 'lung', 'kidney', 'liver',
        'diabetes', 'cancer', 'covid', 'flu', 'infection',
        'allergy', 'allergic', 'reaction', 'side effect',
        'test', 'lab', 'laboratory', 'x-ray', 'scan', 'mri', 'ct',
        'vaccine', 'vaccination', 'immunization',
        # Document analysis keywords
        'document', 'pdf', 'report', 'uploaded', 'file', 'analyze', 'analysis',
        'information', 'content', 'data', 'results', 'findings'
    ]
    
    lower_query = query.lower()
    return any(keyword in lower_query for keyword in medical_keywords)


def extract_medical_entities(text: str) -> List[str]:
    """
    Extract medical entities from text using basic pattern matching
    In production, this would use NER models
    """
    entities = []
    
    # Basic patterns for medical entities
    medication_pattern = r'\b(?:medication|medicine|drug|pill|tablet|capsule)\b'
    symptom_pattern = r'\b(?:pain|ache|fever|nausea|headache|fatigue)\b'
    condition_pattern = r'\b(?:diabetes|hypertension|covid|flu|cancer)\b'
    
    # Find medications
    medications = re.findall(medication_pattern, text, re.IGNORECASE)
    entities.extend([f"medication:{med}" for med in medications])
    
    # Find symptoms
    symptoms = re.findall(symptom_pattern, text, re.IGNORECASE)
    entities.extend([f"symptom:{sym}" for sym in symptoms])
    
    # Find conditions
    conditions = re.findall(condition_pattern, text, re.IGNORECASE)
    entities.extend([f"condition:{cond}" for cond in conditions])
    
    return list(set(entities))  # Remove duplicates


def sanitize_medical_text(text: str) -> str:
    """
    Sanitize medical text for safe processing
    """
    # Remove potential PHI patterns (basic implementation)
    # In production, use proper PHI detection/redaction tools
    
    # Remove phone numbers
    text = re.sub(r'\b\d{3}-\d{3}-\d{4}\b', '[PHONE]', text)
    
    # Remove SSNs
    text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', text)
    
    # Remove dates that might be DOBs
    text = re.sub(r'\b\d{1,2}/\d{1,2}/\d{4}\b', '[DATE]', text)
    
    return text


def calculate_medical_urgency(text: str) -> str:
    """
    Calculate urgency level based on text content
    """
    emergency_terms = ['emergency', 'urgent', 'severe', 'acute', 'chest pain', 'difficulty breathing']
    high_terms = ['pain', 'severe', 'worsening', 'bleeding']
    
    text_lower = text.lower()
    
    if any(term in text_lower for term in emergency_terms):
        return 'emergency'
    elif any(term in text_lower for term in high_terms):
        return 'high'
    else:
        return 'medium'

