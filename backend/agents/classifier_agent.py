from services.gemini_service import classify_incident
from models.incident import IncidentClassification
import logging

logger = logging.getLogger(__name__)

async def run_classifier(report_text: str, location_hint: str,
                         image_bytes: bytes = None) -> IncidentClassification:
    try:
        raw = await classify_incident(report_text, location_hint, image_bytes)
        return IncidentClassification(**raw)
    except Exception as e:
        logger.error(f'Classifier error: {e}')
        # Fallback: treat as high-severity security incident
        return IncidentClassification(
            incident_type='security', severity='high',
            location=location_hint or 'unknown',
            summary='Classification failed - manual review required',
            responders_needed=['security', 'management'],
            evacuation_required=False, confidence=0.0,
            ai_reasoning='Automated classification failed. Defaulting to security protocol. Manual review required.')
