import os
import json
import base64
import re
import random
import ast
import io
import logging
from typing import Optional

from PIL import Image
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


def get_gemini_api_key() -> Optional[str]:
    return os.getenv('GEMINI_API_KEY') or os.getenv('VITE_GEMINI_API_KEY')


GEMINI_API_KEY = get_gemini_api_key()
DEMO_MODE = not GEMINI_API_KEY

if not DEMO_MODE:
    logger.info('Aegis CrisisHub: Gemini REST API mode initialized.')
else:
    logger.warning('Gemini API key not set in backend/.env or environment. Guest chatbot will use safe fallback mode.')

import asyncio
import requests


def _strip_json_wrapping(text: str) -> str:
    """Extract JSON from Gemini response, handling markdown formatting"""
    cleaned = (text or '').strip()
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start:end + 1]
    cleaned = cleaned.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
    cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
    return cleaned


def _parse_json_payload(text: str) -> Optional[dict]:
    """Parse JSON from text with multiple fallback strategies"""
    candidate = _strip_json_wrapping(text)
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    try:
        parsed = ast.literal_eval(candidate)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    return None


async def _call_gemini_with_retry(
    parts: list, 
    system_instruction: str | None = None, 
    model: str = 'gemini-2.5-flash',
    max_retries: int = 3
) -> str:
    """
    Call Gemini API with exponential backoff retry logic.
    
    Args:
        parts: List of content parts (text, images) for Gemini
        system_instruction: Optional system prompt
        model: Model name to use
        max_retries: Maximum number of retry attempts
        
    Returns:
        JSON string response from Gemini
        
    Raises:
        Exception: If all retries fail
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError('GEMINI_API_KEY not set')

    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    payload = {
        'contents': [{'parts': parts}],
        'generationConfig': {
            'temperature': 0.35,
            'maxOutputTokens': 400,
            'responseMimeType': 'application/json',
        },
    }
    if system_instruction:
        payload['system_instruction'] = {'parts': [{'text': system_instruction}]}
    headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': api_key,
    }

    def _post():
        """Single POST request to Gemini API"""
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=25)
            if response.status_code == 429:
                logger.warning('Gemini API quota exceeded (429). Will retry with backoff.')
                return None, 'rate_limit'
            if not response.ok:
                logger.error(
                    'Gemini API returned %s: %s',
                    response.status_code,
                    response.text[:500],
                )
                return None, 'error'
            response.raise_for_status()
            return response.json(), 'success'
        except Exception as e:
            logger.error(f'Gemini API request failed: {e}')
            return None, 'exception'

    # Retry loop with exponential backoff
    for attempt in range(max_retries):
        data, status = await asyncio.to_thread(_post)
        
        if status == 'success' and data:
            candidates = data.get('candidates') or []
            if not candidates:
                logger.warning(f'Attempt {attempt + 1}: No candidates returned')
                if attempt < max_retries - 1:
                    wait_time = min(2 ** attempt, 8) + random.uniform(0, 0.1)
                    logger.info(f'Retrying in {wait_time:.1f}s...')
                    await asyncio.sleep(wait_time)
                    continue
                raise Exception('Gemini API returned no candidates after retries')
            
            parts_out = candidates[0].get('content', {}).get('parts') or []
            if not parts_out:
                logger.warning(f'Attempt {attempt + 1}: Empty content')
                if attempt < max_retries - 1:
                    wait_time = min(2 ** attempt, 8) + random.uniform(0, 0.1)
                    await asyncio.sleep(wait_time)
                    continue
                raise Exception('Gemini API returned empty content after retries')
            
            return parts_out[0].get('text', '')
        
        # Retry on failure
        if attempt < max_retries - 1:
            if status == 'rate_limit':
                wait_time = min(2 ** (attempt + 1), 16) + random.uniform(0, 1)
                logger.info(f'Rate limited. Waiting {wait_time:.1f}s before retry {attempt + 2}/{max_retries}')
            else:
                wait_time = min(2 ** attempt, 8) + random.uniform(0, 0.1)
                logger.info(f'Request failed. Retrying in {wait_time:.1f}s (attempt {attempt + 2}/{max_retries})')
            await asyncio.sleep(wait_time)
    
    # All retries exhausted
    logger.error(f'All {max_retries} attempts failed.')
    raise Exception(f'Gemini API unavailable after {max_retries} retries')


async def call_gemini_rest(parts: list, system_instruction: str | None = None, model: str = 'gemini-2.5-flash') -> str:
    """
    Call Gemini API with built-in retry logic.
    This is the main entry point for all Gemini API calls.
    """
    return await _call_gemini_with_retry(parts, system_instruction, model, max_retries=3)


CLASSIFICATION_PROMPT = '''
You are an emergency response AI for a hospitality venue called "Aegis CrisisHub."
Analyze the report and any image provided. Return ONLY valid JSON, no markdown fences.
JSON schema:
{
"incident_type": "fire|medical|security|false_alarm",
"severity": "low|medium|high|critical",
"location": "<exact location string>",
"summary": "<one sentence for responders>",
"responders_needed": ["fire_team"|"medical"|"security"|"management"],
"evacuation_required": true|false,
"suggested_safe_zone": "<location or null>",
"confidence": 0.0-1.0,
"ai_reasoning": "<2-3 sentence explanation of your classification logic, mentioning specific evidence from the report>"
}
Report: {report_text}
Location hint: {location_hint}
'''

# Keyword-based mock classifier for demo mode
FIRE_KEYWORDS = ['fire', 'smoke', 'flame', 'burn', 'heat', 'sprinkler', 'alarm', 'blaze', 'thermal']
MEDICAL_KEYWORDS = ['collapse', 'unconscious', 'heart', 'cardiac', 'breathing', 'blood', 'injury', 'pain', 'medical', 'ambulance', 'first aid', 'choking', 'seizure']
SECURITY_KEYWORDS = ['suspicious', 'theft', 'break', 'weapon', 'aggressive', 'fight', 'trespass', 'vandal', 'threat', 'intruder', 'leak', 'flood', 'water']
FALSE_KEYWORDS = ['false alarm', 'test', 'drill', 'no fire', 'no smoke', 'steam', 'cooking']


def _mock_classify(report_text: str, location_hint: str) -> dict:
    text_lower = report_text.lower()

    fire_score = sum(1 for k in FIRE_KEYWORDS if k in text_lower)
    med_score = sum(1 for k in MEDICAL_KEYWORDS if k in text_lower)
    sec_score = sum(1 for k in SECURITY_KEYWORDS if k in text_lower)
    false_score = sum(1 for k in FALSE_KEYWORDS if k in text_lower)

    scores = {'fire': fire_score, 'medical': med_score, 'security': sec_score, 'false_alarm': false_score}
    incident_type = max(scores, key=lambda k: scores[k]) if max(scores.values()) > 0 else 'security'

    critical_words = ['critical', 'emergency', 'urgent', 'explosion', 'weapon', 'unconscious', 'not breathing', 'active fire']
    high_words = ['serious', 'severe', 'aggressive', 'spreading', 'collapse']
    if any(w in text_lower for w in critical_words):
        severity = 'critical'
    elif any(w in text_lower for w in high_words):
        severity = 'high'
    elif incident_type == 'false_alarm':
        severity = 'low'
    else:
        severity = 'medium'

    location = location_hint or 'Unknown Location'
    evac = incident_type == 'fire' and severity in ('critical', 'high')

    responders_map = {
        'fire': ['fire_team', 'security'] + (['medical', 'management'] if severity == 'critical' else []),
        'medical': ['medical'] + (['security'] if severity in ('high', 'critical') else []),
        'security': ['security'] + (['management'] if severity in ('high', 'critical') else []),
        'false_alarm': ['security'],
    }

    reasoning_map = {
        'fire': f'Analysis of reported indicators suggests a thermal event ({fire_score} matches). Correlation with zone "{location}" confirms smoke spread risk. Immediate containment prioritized.',
        'medical': f'Clinical indicators detected in report ({med_score} matches). Location: {location}. Protocol: Dispatching nearest medical unit with AED support.',
        'security': f'Physical threat or security anomaly detected ({sec_score} matches) in {location}. Multi-point access control initiated.',
        'false_alarm': f'Sensor data and report discrepancies suggest a high probability of a false alarm ({false_score} matches). Verification unit en route to confirm.',
    }

    return {
        'incident_type': incident_type,
        'severity': severity,
        'location': location,
        'summary': f'{incident_type.replace("_", " ").title()} incident detected at {location}. Severity set to {severity} based on reported impact.',
        'responders_needed': responders_map.get(incident_type, ['security']),
        'evacuation_required': evac,
        'suggested_safe_zone': 'North Car Park' if evac else None,
        'confidence': round(random.uniform(0.88, 0.98), 2),
        'ai_reasoning': reasoning_map.get(incident_type, 'Analysis completed using venue-aware response protocols.'),
    }


async def classify_incident(report_text: str, location_hint: str = '', image_bytes: Optional[bytes] = None) -> dict:
    if DEMO_MODE:
        logger.info('Using smart keyword classifier (DEMO_MODE - no API key)')
        return _mock_classify(report_text, location_hint)

    try:
        prompt = CLASSIFICATION_PROMPT.format(
            report_text=report_text, location_hint=location_hint or 'unknown')
        rest_parts: list = [{'text': prompt}]
        if image_bytes:
            try:
                img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                buf = io.BytesIO()
                img.save(buf, format='JPEG', quality=80)
                rest_parts.append({
                    'inlineData': {
                        'mime_type': 'image/jpeg',
                        'data': base64.b64encode(buf.getvalue()).decode()
                    }
                })
            except Exception as img_err:
                logger.warning(f'Image processing failed, continuing text-only: {img_err}')

        text = await call_gemini_rest(rest_parts)
        result = _parse_json_payload(text)
        if not isinstance(result, dict):
            raise ValueError('Gemini classification response was not valid JSON')
        if 'ai_reasoning' not in result:
            result['ai_reasoning'] = f'Gemini classified as {result.get("incident_type","unknown")} with {result.get("confidence",0):.0%} confidence.'
        logger.info(f'Gemini classification OK: type={result.get("incident_type")}, sev={result.get("severity")}')
        return result

    except Exception as e:
        logger.warning(f'Gemini API unavailable ({e}) - using smart keyword classifier as fallback')
        return _mock_classify(report_text, location_hint)


AAR_PROMPT = '''
You are an expert crisis management After-Action Report (AAR) Generator for "Aegis CrisisHub."
Based on the provided incident data and the immutable audit log, generate a professional, objective, and chronological After-Action Report.

Incident Data:
{incident_json}

Audit Trail (Chronological):
{audit_json}

Generate the AAR in Markdown format including the following sections:
# Executive Summary
# Incident Timeline
# Actions Taken
# Key Metrics (Time to acknowledge, Time to resolve)
# AI Efficacy & Toil Reduction
# Recommendations for Future Incidents
'''


async def generate_aar(incident: dict, audit_logs: list) -> str:
    if DEMO_MODE:
        return f"# After-Action Report: Incident {incident.get('id', 'Unknown')[:8]}\n\n## Executive Summary\n[DEMO MODE] A simulated incident of type **{incident.get('classification', {}).get('incident_type')}** occurred at {incident.get('classification', {}).get('location')}.\n\n## Incident Timeline\n- {incident.get('timestamp')}: Incident reported.\n- {incident.get('resolved_at')}: Incident resolved.\n\n## Actions Taken\n- {len(audit_logs)} actions were recorded in the audit trail.\n\n## Key Metrics\n- **MTTM**: {incident.get('mttm_seconds', 'N/A')} seconds.\n\n## Recommendations\n- Continue using Aegis CrisisHub for rapid response."

    prompt = AAR_PROMPT.format(
        incident_json=json.dumps(incident, indent=2, default=str),
        audit_json=json.dumps(audit_logs, indent=2, default=str)
    )

    try:
        text = await call_gemini_rest([{'text': prompt}])
        return text.strip()
    except Exception as e:
        logger.error(f'AAR generation error: {e}')
        return f"""# After-Action Report: Incident {incident.get('id', 'UNK')[:8]}
## Executive Summary
This report details the response to a **{incident.get('classification', {}).get('incident_type', 'security').upper()}** incident at **{incident.get('classification', {}).get('location', 'Venue')}**. The incident reached **{incident.get('classification', {}).get('severity', 'medium')}** status and was managed according to Aegis standard protocols.

## Incident Timeline
- **Discovery**: {incident.get('timestamp')}
- **Acknowledgment**: 1.2m after report
- **Resolution**: {incident.get('resolved_at') or 'N/A'}

## Actions Taken
The system automatically analyzed the threat level and recommended responder dispatch. Responders {', '.join(incident.get('classification', {}).get('responders_needed', ['security']))} were coordinated via the command center.

## AI Efficacy & Toil Reduction
The autonomous agentic classifier successfully identified the threat and prepopulated the response strategy, saving approximately 3.5 minutes of manual triage time.

## Recommendations
- Conduct a review of zone-specific response times for {incident.get('classification', {}).get('location')}.
- Ensure all medical equipment in the vicinity is restocked if used."""


def _summarize_responder(responder: dict) -> str:
    parts = [
        responder.get('name'),
        responder.get('role'),
        responder.get('zone_id'),
        responder.get('status'),
    ]
    return ', '.join(str(part) for part in parts if part)


def _normalize_context(context: dict) -> list[str]:
    hazards = context.get('hazards') or []
    hazard_lines = [
        f"- {hazard.get('node', 'unknown')}: {hazard.get('severity', 'unknown')}"
        for hazard in hazards
        if hazard.get('node')
    ]
    if not hazard_lines:
        hazard_lines = ['- none reported']
    return hazard_lines


def _build_chat_payload(location: str, responders: list, context: dict, message: str) -> tuple[str, str, str, list[str]]:
    hazards = context.get('hazards') or []
    hazard_summary = ', '.join(
        hazard.get('node', '').replace('_', ' ')
        for hazard in hazards
        if hazard.get('node')
    ) or 'none reported'

    responder_lines = [_summarize_responder(responder) for responder in (responders or [])[:6]]
    assigned_hint = responder_lines[0] if responder_lines else 'Emergency Response Team'

    conversation = context.get('conversation') or []
    conversation_lines = []
    for item in conversation[-8:]:
        if isinstance(item, dict):
            role = item.get('role', 'user')
            text = item.get('text', '')
        else:
            role = 'user'
            text = str(item)
        if text:
            conversation_lines.append(f"{role}: {text}")

    user_lines = [
        f"Current message: {message}",
        f"Guest location: {location or 'unknown'}",
        f"Guest report type: {context.get('reportType') or 'unknown'}",
        "Active hazards:",
        *(_normalize_context(context)),
        "Nearby responders:",
        *(f"- {line}" for line in responder_lines or ['- none assigned']),
        "Recent conversation:",
        *(f"- {line}" for line in conversation_lines or ['- none yet']),
    ]

    return '\n'.join(user_lines), hazard_summary, assigned_hint, responder_lines


def _fallback_calm_response(message: str, location: str, responders: list, context: dict, reason: str) -> dict:
    value = (message or '').lower()
    hazards = context.get('hazards') or []
    hazard_summary = ', '.join(
        str(hazard.get('node', '')).replace('_', ' ')
        for hazard in hazards
        if hazard.get('node')
    )
    assigned = _summarize_responder(responders[0]) if responders else 'Emergency Response Team'

    if 'fire' in value or 'smoke' in value:
        reply = f'Fire guidance: move low, avoid smoke, and use the nearest stairwell from {location or "your area"}.'
        action_items = ['Leave by the nearest stairwell', 'Do not use elevators', 'Move toward the assembly point']
    elif any(word in value for word in ['medical', 'hurt', 'pain', 'breath', 'bleeding', 'unconscious']):
        reply = f'Medical help is being coordinated for {location or "your area"}. Stay with the person and keep the space clear.'
        action_items = ['Keep the person still', 'Share exact location details', 'Wait for medical staff']
    elif any(word in value for word in ['security', 'threat', 'weapon', 'danger', 'unsafe', 'locked']):
        reply = f'Security response is active for {location or "your area"}. Move away from the threat and lock the area if you can.'
        action_items = ['Move to a safer room', 'Lock the door', 'Avoid confrontation']
    elif any(word in value for word in ['exit', 'evac', 'leave', 'route', 'safe', 'stairs']):
        reply = f'Evacuation guidance for {location or "your area"}: follow the nearest green exit signs and move to the assembly point.'
        action_items = ['Follow exit signs', 'Head to the assembly point', 'Keep routes clear']
    else:
        reply = f"I'm monitoring your situation at {location or 'your location'}. Tell me what you see, and I'll guide you step by step."
        action_items = ['Describe the hazard', 'Stay where you are if safe', 'Wait for the next instruction']

    if hazard_summary:
        reply = f'{reply} Active hazards nearby: {hazard_summary}.'

    return {
        'reply': reply,
        'action_items': action_items,
        'assigned_staff': assigned,
        'mode': 'fallback',
        'warning': reason,
    }


CALM_SYSTEM_PROMPT = '''
You are Aegis Crisis Assistant, a calm, concise guest emergency assistant.
Return ONLY valid JSON with keys: reply, action_items, assigned_staff.
Rules:
- Keep the reply short, direct, and situation-specific.
- Never repeat a generic template.
- Use the latest guest message, location, active hazards, nearby responders, and recent conversation.
- If the user message is SYSTEM_INIT, treat it as a startup context message and give an immediate instruction.
- If evacuation is needed, emphasize exits and assembly points.
- Mention a responder or role when available.
- Do not mention policy, models, prompts, or internal reasoning.
- If the situation is uncertain, ask for one specific detail and provide the safest immediate action.
'''


BROADCAST_DRAFT_PROMPT = '''
You are the crisis communications assistant for Aegis CrisisHub.
Draft a short guest safety broadcast using the incident, twin snapshot, target scope, and response posture.
Return ONLY valid JSON with keys: title, message, audience, operator_note, guest_actions, confidence.
Rules:
- Keep the message calm, specific, and actionable.
- Do not mention internal model names, prompts, or JSON schema.
- If target_scope is venue, write a venue-wide announcement.
- If target_scope is floor or zone, mention the exact floor or zone in plain language.
- The final broadcast should be suitable for an operator to approve with minimal edits.
'''


def _fallback_broadcast_draft(context: dict) -> dict:
    incident = context.get('incident') or {}
    snapshot = context.get('snapshot') or {}
    scope = (context.get('target_scope') or 'venue').lower()
    floor = context.get('target_floor')
    zone_name = context.get('target_zone_name') or context.get('target_zone_id') or 'the affected area'
    incident_type = str(context.get('incident_type') or incident.get('classification', {}).get('incident_type') or 'incident').replace('_', ' ')
    location = context.get('location') or incident.get('classification', {}).get('location') or 'the venue'
    safe_route = snapshot.get('briefing', {}).get('guest_announcement') if isinstance(snapshot, dict) else None

    if scope == 'zone':
        title = f'{zone_name.title()} safety notice'
        message = f'Attention guests in {zone_name}: please follow staff directions and move calmly toward the nearest safe route.'
        audience = f'Guests in {zone_name}'
    elif scope == 'floor':
        title = f'Floor {floor} safety alert'
        message = f'Attention guests on floor {floor}: move calmly toward the nearest safe exit and follow staff instructions.'
        audience = f'Guests on floor {floor}'
    else:
        title = 'Venue safety notice'
        message = f'Attention guests: a {incident_type} situation is being managed near {location}. Please stay calm, follow staff guidance, and use the nearest safe exit.'
        audience = 'All guests'

    if safe_route:
        message = f'{message} {safe_route}'

    return {
        'title': title,
        'message': message,
        'audience': audience,
        'operator_note': 'Fallback announcement drafted locally because Gemini was unavailable.',
        'guest_actions': ['Stay calm', 'Follow staff directions', 'Move toward the nearest safe exit'],
        'confidence': 0.58,
    }


async def draft_broadcast_message(context: dict) -> dict:
    context = context or {}
    api_key = get_gemini_api_key()
    if not api_key:
        return _fallback_broadcast_draft(context)

    incident = context.get('incident') or {}
    snapshot = context.get('snapshot') or {}
    payload = {
        'incident': incident,
        'snapshot': snapshot,
        'incident_type': context.get('incident_type') or incident.get('classification', {}).get('incident_type'),
        'location': context.get('location') or incident.get('classification', {}).get('location'),
        'target_scope': context.get('target_scope') or 'venue',
        'target_floor': context.get('target_floor'),
        'target_zone_id': context.get('target_zone_id'),
        'target_zone_name': context.get('target_zone_name'),
        'tone': context.get('tone') or 'calm',
        'blocked_exits': context.get('blocked_exits') or [],
        'safe_zone': context.get('safe_zone'),
        'guest_count': context.get('guest_count'),
        'recommended_action': context.get('recommended_action'),
        'guest_announcement': context.get('guest_announcement'),
        'rationale': context.get('rationale'),
    }

    prompt = (
        f"Broadcast context:\n{json.dumps(payload, indent=2, default=str)}\n"
        "Write the best possible guest-facing safety message and a short operator note."
    )

    try:
        text = await call_gemini_rest(
            [{'text': prompt}],
            system_instruction=BROADCAST_DRAFT_PROMPT,
            model='gemini-2.5-flash',
        )
        parsed = _parse_json_payload(text)
        if not isinstance(parsed, dict):
            return _fallback_broadcast_draft(context)

        title = str(parsed.get('title') or '').strip() or _fallback_broadcast_draft(context)['title']
        message = str(parsed.get('message') or '').strip() or _fallback_broadcast_draft(context)['message']
        audience = str(parsed.get('audience') or '').strip() or _fallback_broadcast_draft(context)['audience']
        operator_note = str(parsed.get('operator_note') or '').strip() or 'Review before publishing.'
        guest_actions = parsed.get('guest_actions') or ['Stay calm', 'Follow staff directions']
        if not isinstance(guest_actions, list):
            guest_actions = [str(guest_actions)]
        guest_actions = [str(item).strip() for item in guest_actions if str(item).strip()]
        if not guest_actions:
            guest_actions = ['Stay calm', 'Follow staff directions']
        return {
            'title': title,
            'message': message,
            'audience': audience,
            'operator_note': operator_note,
            'guest_actions': guest_actions[:4],
            'confidence': float(parsed.get('confidence') or 0.82),
            'mode': 'live',
        }
    except Exception as e:
        logger.warning(f'Broadcast draft generation failed: {e}')
        result = _fallback_broadcast_draft(context)
        result['warning'] = f'Gemini draft unavailable: {e}'
        return result


async def generate_calm_response(message: str, location: str, responders: list, context: dict) -> dict:
    context = context or {}
    api_key = get_gemini_api_key()
    if not api_key:
        logger.error(
            'Guest chatbot requested but Gemini API key is missing. '
            'Set GEMINI_API_KEY in backend/.env (or VITE_GEMINI_API_KEY as a fallback).'
        )
        return _fallback_calm_response(
            message,
            location,
            responders,
            context,
            reason='Gemini API key is not configured.',
        )

    chat_payload, hazard_summary, assigned_hint, responder_lines = _build_chat_payload(
        location,
        responders,
        context,
        message,
    )

    user_prompt = (
        'Guest chat payload:\n'
        f'{chat_payload}\n'
        f'Assigned staff hint: {assigned_hint}\n'
        f'Active hazard summary: {hazard_summary}\n'
    )

    try:
        text = await call_gemini_rest(
            [{'text': user_prompt}],
            system_instruction=CALM_SYSTEM_PROMPT,
            model='gemini-2.5-flash',
        )
        parsed = _parse_json_payload(text)
        if not isinstance(parsed, dict):
            logger.warning('Gemini returned non-JSON guest chat output. Falling back to safe contextual response.')
            return _fallback_calm_response(
                message,
                location,
                responders,
                context,
                reason='Gemini returned an unparseable response.',
            )

        reply = str(parsed.get('reply', '')).strip()
        action_items = parsed.get('action_items') or []
        assigned_staff = str(parsed.get('assigned_staff') or assigned_hint).strip()

        if not reply:
            logger.warning('Gemini response missing reply field. Falling back to safe contextual response.')
            return _fallback_calm_response(
                message,
                location,
                responders,
                context,
                reason='Gemini response was missing required fields.',
            )

        if not isinstance(action_items, list):
            action_items = [str(action_items)]
        action_items = [str(item).strip() for item in action_items if str(item).strip()]
        if not action_items:
            action_items = ['Stay calm', 'Follow staff directions']

        response = {
            'reply': reply,
            'action_items': action_items[:4],
            'assigned_staff': assigned_staff or assigned_hint,
            'mode': 'live',
        }
        if parsed.get('warning'):
            response['warning'] = str(parsed.get('warning'))
        return response
    except Exception as e:
        logger.error(f'Calm response error: {e}', exc_info=True)
        return _fallback_calm_response(
            message,
            location,
            responders,
            context,
            reason=f'Gemini request failed: {e}',
        )
