import httpx, os
from models.incident import Incident

WEBHOOK_MAP = {
    'fire': os.getenv('GOOGLE_CHAT_WEBHOOK_FIRE'),
    'medical': os.getenv('GOOGLE_CHAT_WEBHOOK_MEDICAL'),
    'security': os.getenv('GOOGLE_CHAT_WEBHOOK_SECURITY'),
}

SEVERITY_EMOJI = {'critical': '🚨', 'high': '🔴', 'medium': '🟡', 'low': '🟢'}

async def run_alert(incident: Incident) -> bool:
    c = incident.classification
    webhook = WEBHOOK_MAP.get(c.incident_type, WEBHOOK_MAP['security'])
    
    if not webhook: return False
    emoji = SEVERITY_EMOJI.get(c.severity, '⚠️')
    
    # Standard text fallback
    text_content = (f'{emoji} *INCIDENT ALERT [{c.severity.upper()}]* {emoji}\n'
                    f'*Type:* {c.incident_type.upper()}\n'
                    f'*Location:* {c.location}\n'
                    f'*Summary:* {c.summary}')
    
    # Rich Media Card V2 build for CRITICAL/HIGH
    if c.severity in ('critical', 'high'):
        msg = {
            "cardsV2": [{
                "cardId": incident.id,
                "card": {
                    "header": {
                        "title": f"Aegis CrisisHub: {c.incident_type.upper()}",
                        "subtitle": f"Severity: {c.severity.upper()} | Location: {c.location}",
                        "imageUrl": "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/warning/default/48px.svg",
                        "imageType": "SQUARE"
                    },
                    "sections": [
                        {
                            "header": "Gemini Classification Report",
                            "widgets": [
                                {
                                    "textParagraph": {
                                        "text": f"<b>Summary:</b> {c.summary}"
                                    }
                                },
                                {
                                    "textParagraph": {
                                        "text": f"<b>Responders Needed:</b> {', '.join(c.responders_needed)}<br><b>Evacuation Required:</b> {c.evacuation_required}"
                                    }
                                }
                            ]
                        },
                        {
                            "widgets": [
                                {
                                    "buttonList": {
                                        "buttons": [
                                            {
                                                "text": "Accept Mission",
                                                "onClick": {
                                                    "openLink": {
                                                        "url": f"http://localhost:5173/"
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    ]
                }
            }]
        }
    else:
        msg = {'text': text_content}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook, json=msg, timeout=5.0)
            return resp.status_code == 200
    except Exception:
        return False
