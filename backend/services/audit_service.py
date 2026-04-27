import logging

logger = logging.getLogger(__name__)

class AuditReasonGenerator:
    """Generates detailed, contextual reasons for audit events based on incident data"""
    
    @staticmethod
    def incident_classified(incident, classification):
        """Reason for incident classification event"""
        confidence = int(classification.confidence * 100) if hasattr(classification, 'confidence') else 0
        incident_type = getattr(classification, 'incident_type', 'incident')
        severity = getattr(classification, 'severity', 'unknown')
        
        if incident_type == 'fire':
            return f"Thermal sensor confidence exceeded {confidence}% threshold in {classification.location} zone. Smoke spread model activated. Severity escalated to {severity.upper()}"
        elif incident_type == 'medical':
            return f"Medical emergency keywords detected with {confidence}% confidence. Location normalized to {classification.location}. AED stations identified nearby."
        elif incident_type == 'security':
            return f"Security threat pattern matched with {confidence}% confidence. Zone {classification.location} flagged. Access control review recommended."
        else:
            return f"Incident classification complete: {incident_type} in {classification.location} ({severity}, {confidence}% confidence)"
    
    @staticmethod
    def route_calculated(incident, route):
        """Reason for route calculation event"""
        if not route:
            return "Route calculation complete. No safe path available - alternative evacuation required"
        
        path = route.get('path', [])
        hazards = route.get('hazards_avoided', [])
        
        reason = f"A* pathfinding calculated route: {' → '.join(path[:3])}"
        if len(path) > 3:
            reason += f" (+{len(path) - 3} more steps)"
        if hazards:
            reason += f". Avoided {len(hazards)} hazard zones"
        
        return reason
    
    @staticmethod
    def responder_dispatched(incident, responder, reason_detail=""):
        """Reason for responder dispatch event"""
        responder_role = responder.get('role', 'responder') if isinstance(responder, dict) else 'responder'
        responder_name = responder.get('name', 'Unknown') if isinstance(responder, dict) else 'Unknown'
        
        incident_location = incident.get('classification', {}).get('location', 'unknown zone') if isinstance(incident, dict) else 'unknown zone'
        
        if reason_detail:
            return f"{responder_name} ({responder_role}) auto-dispatched to {incident_location}. {reason_detail}"
        
        return f"{responder_name} ({responder_role}) auto-dispatched to {incident_location} due to incident demand"
    
    @staticmethod
    def responder_acknowledged(responder, incident, time_seconds=None):
        """Reason for responder acknowledgement"""
        responder_name = responder.get('name', 'Responder') if isinstance(responder, dict) else 'Responder'
        time_text = f" in {time_seconds}s" if time_seconds else ""
        
        incident_type = incident.get('classification', {}).get('incident_type', 'incident') if isinstance(incident, dict) else 'incident'
        
        return f"{responder_name} acknowledged dispatch{time_text}. Ready to proceed to {incident_type} scene"
    
    @staticmethod
    def escalation_approved(incident, authority, operator, reason=""):
        """Reason for escalation approval"""
        incident_type = incident.get('classification', {}).get('incident_type', 'incident') if isinstance(incident, dict) else 'incident'
        location = incident.get('classification', {}).get('location', 'unknown') if isinstance(incident, dict) else 'unknown'
        severity = incident.get('classification', {}).get('severity', 'unknown') if isinstance(incident, dict) else 'unknown'
        
        if reason:
            return f"Operator {operator} approved escalation to {authority}. {incident_type} at {location} ({severity}). {reason}"
        
        return f"Operator {operator} approved escalation to {authority} for {severity} {incident_type} at {location}"
    
    @staticmethod
    def false_alarm_declared(incident, operator, reason=""):
        """Reason for false alarm declaration"""
        location = incident.get('classification', {}).get('location', 'unknown') if isinstance(incident, dict) else 'unknown'
        
        if reason:
            return f"Operator {operator} resolved as false alarm. {location} cleared. {reason}"
        
        return f"Operator {operator} verified as false alarm after manual zone inspection"
    
    @staticmethod
    def guest_help_received(guest_help):
        """Reason for guest help report"""
        help_type = guest_help.get('help_type', 'assistance')
        location = guest_help.get('guest_location', 'unknown')
        severity = guest_help.get('severity', 'unknown')
        
        desc = guest_help.get('description', '')[:50]
        
        return f"Guest help request received from {location}. Type: {help_type} ({severity}). Request: {desc}"
    
    @staticmethod
    def guest_guided(guest_help, route):
        """Reason for guest guidance event"""
        location = guest_help.get('guest_location', 'unknown') if isinstance(guest_help, dict) else 'unknown'
        
        if route:
            path = route.get('path', [])
            path_text = f" → ".join(path[:3]) if path else "evacuation"
            return f"Real-time safe route provided from {location}. Route: {path_text}"
        
        return f"Safe route provided from {location} based on current hazard assessment"
    
    @staticmethod
    def operator_action(action_type, actor, incident, detail=""):
        """Generic reason for operator action"""
        incident_type = incident.get('classification', {}).get('incident_type', 'incident') if isinstance(incident, dict) else 'incident'
        location = incident.get('classification', {}).get('location', 'unknown') if isinstance(incident, dict) else 'unknown'
        
        action_map = {
            'verify': f"{actor} verified {incident_type} status at {location}",
            'escalate': f"{actor} escalated {incident_type} to higher authority",
            'approve': f"{actor} approved recommended action for {incident_type}",
            'override': f"{actor} manually overrode automation for {incident_type}",
            'acknowledge': f"{actor} acknowledged {incident_type} incident",
            'resolve': f"{actor} marked {incident_type} as resolved",
        }
        
        reason = action_map.get(action_type, f"{actor} performed {action_type} action")
        
        if detail:
            reason += f". {detail}"
        
        return reason


def generate_audit_reason(event_action, incident=None, classification=None, responder=None, actor=None, **kwargs):
    """
    High-level function to generate audit reason based on action type
    """
    generator = AuditReasonGenerator()
    
    try:
        if event_action == 'incident_classified':
            return generator.incident_classified(incident, classification)
        elif event_action == 'route_calculated':
            return generator.route_calculated(incident, kwargs.get('route'))
        elif event_action == 'responder_dispatched':
            return generator.responder_dispatched(incident, responder, kwargs.get('detail', ''))
        elif event_action == 'responder_acknowledged':
            return generator.responder_acknowledged(responder, incident, kwargs.get('time_seconds'))
        elif event_action == 'escalation_approved':
            return generator.escalation_approved(incident, kwargs.get('authority', 'authorities'), actor, kwargs.get('reason', ''))
        elif event_action == 'false_alarm_declared':
            return generator.false_alarm_declared(incident, actor, kwargs.get('reason', ''))
        elif event_action == 'guest_help_received':
            return generator.guest_help_received(kwargs.get('guest_help', {}))
        elif event_action == 'guest_guided':
            return generator.guest_guided(kwargs.get('guest_help', {}), kwargs.get('route'))
        elif event_action == 'operator_action':
            return generator.operator_action(kwargs.get('action_type', 'perform'), actor, incident, kwargs.get('detail', ''))
        else:
            return f"System event: {event_action}"
    except Exception as e:
        logger.error(f"Error generating audit reason for {event_action}: {e}")
        return f"{event_action} completed"
