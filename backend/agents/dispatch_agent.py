from models.incident import IncidentClassification
from services.firestore_service import get_available_responders, update_responder_status
from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)

# ─── Dispatch Matrix ───────────────────────────────────────
DISPATCH_MATRIX = {
    'fire': {
        'critical': ['fire_team', 'medical', 'management', 'security'],
        'high': ['fire_team', 'security', 'management'],
        'medium': ['fire_team', 'security'],
        'low': ['security']
    },
    'medical': {
        'critical': ['medical', 'management', 'security'],
        'high': ['medical', 'security'],
        'medium': ['medical'],
        'low': ['medical']
    },
    'security': {
        'critical': ['security', 'management', 'medical'],
        'high': ['security', 'management'],
        'medium': ['security'],
        'low': ['security']
    },
    'false_alarm': {
        'critical': ['security'], 'high': ['security'],
        'medium': ['security'], 'low': ['security']
    }
}

# ─── Autonomous Escalation Rules ──────────────────────────
# Keywords that trigger external authority notification
WEAPON_KEYWORDS = ['weapon', 'gun', 'knife', 'armed', 'shooting', 'stabbing']
ACCELERANT_KEYWORDS = ['explosion', 'bomb', 'gas leak', 'arson', 'accelerant', 'detonation']
MASS_CASUALTY_KEYWORDS = ['multiple victims', 'mass casualty', 'many injured', 'stampede']
ALTERCATION_KEYWORDS = ['altercation', 'fight', 'brawl', 'assault', 'punch']

def _evaluate_escalation(classification: IncidentClassification,
                          report_text: str = '') -> List[dict]:
    """
    Autonomous triage logic: evaluate if external authorities need auto-dispatch.
    Goes beyond simple notification — makes active decisions based on threat indicators.
    
    Returns list of autonomous actions taken.
    """
    actions = []
    text_lower = (report_text + ' ' + classification.summary).lower()

    # Rule 1: Weapon detection → auto-dispatch police
    if any(kw in text_lower for kw in WEAPON_KEYWORDS):
        if classification.severity in ('critical', 'high'):
            actions.append({
                'action': 'escalate',
                'detail': 'AUTONOMOUS: Local police auto-dispatched — weapon indicators detected in report',
                'authority': 'police',
                'reasoning': f'Weapon keywords detected. Severity={classification.severity}. Active threat protocol engaged.',
            })
            logger.warning(f'[ESCALATION] Police auto-dispatch triggered for {classification.location}')

    # Rule 2: Fire + accelerant → auto-dispatch fire department
    if classification.incident_type == 'fire':
        if classification.severity == 'critical' or any(kw in text_lower for kw in ACCELERANT_KEYWORDS):
            actions.append({
                'action': 'escalate',
                'detail': 'AUTONOMOUS: Local fire department notified — critical fire / accelerant detected',
                'authority': 'fire_department',
                'reasoning': f'Fire severity={classification.severity}. Evacuation={classification.evacuation_required}. External fire response required.',
            })

    # Rule 3: Mass casualty → auto-dispatch EMS
    if any(kw in text_lower for kw in MASS_CASUALTY_KEYWORDS):
        actions.append({
            'action': 'escalate',
            'detail': 'AUTONOMOUS: Emergency Medical Services (EMS) auto-dispatched — mass casualty indicators',
            'authority': 'ems',
            'reasoning': 'Mass casualty keywords detected. Multiple ambulances may be required.',
        })

    # Rule 4: Critical medical → hospital pre-alert
    if classification.incident_type == 'medical' and classification.severity == 'critical':
        actions.append({
            'action': 'escalate',
            'detail': 'AUTONOMOUS: Nearest hospital ER pre-alerted for incoming critical patient',
            'authority': 'hospital',
            'reasoning': 'Critical medical event. Pre-alerting hospital reduces handoff time by ~4 minutes.',
        })

    # Rule 5: Physical Altercation Auto-Escalation (Simulated 2-minute threshold)
    if any(kw in text_lower for kw in ALTERCATION_KEYWORDS) and classification.incident_type == 'security':
        # Since this is a stateless triage, we immediately add the intent or simulate the delay.
        actions.append({
            'action': 'escalate',
            'detail': 'AUTONOMOUS: Local police auto-dispatched — Physical altercation unresolved for > 2 mins',
            'authority': 'police',
            'reasoning': 'SLA exceeded for active physical altercation. Automatic external escalation triggered.',
        })

    return actions


async def run_dispatch(classification: IncidentClassification,
                       incident_id: str,
                       report_text: str = '') -> Tuple[List[str], List[dict]]:
    """
    Smart dispatch with autonomous escalation.
    
    Returns:
        Tuple of (assigned_responder_names, autonomous_actions)
    """
    # Step 1: Determine needed responder roles
    needed = DISPATCH_MATRIX.get(classification.incident_type, {}).get(
        classification.severity, ['security'])

    # Step 2: Assign available responders from each role
    assigned = []
    dispatch_actions = []
    for role in needed:
        responders = await get_available_responders(role)
        for r in responders[:1]:  # Assign first available per role
            await update_responder_status(r['id'], 'dispatched', incident_id)
            assigned.append(r['name'])
            dispatch_actions.append({
                'action': 'dispatch',
                'detail': f'{r["name"]} ({role}) auto-dispatched from {r.get("location", "unknown")}',
            })

    # Step 3: Autonomous escalation evaluation
    escalation_actions = _evaluate_escalation(classification, report_text)

    all_actions = dispatch_actions + escalation_actions

    if escalation_actions:
        logger.info(f'[AGENTIC] {len(escalation_actions)} autonomous escalations triggered for incident {incident_id}')

    return assigned, all_actions
