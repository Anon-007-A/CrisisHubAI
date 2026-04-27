"""
Unit tests for CrisisHub models and agents.
Tests critical paths: incident validation, classification, and fallback behavior.

Run with: pytest test_models.py -v
"""

import pytest
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.incident import IncidentInput, IncidentClassification, Incident
from pydantic import ValidationError


class TestIncidentInputValidation:
    """Test IncidentInput model validation"""
    
    def test_valid_incident_input(self):
        """Valid incident input should be accepted"""
        incident = IncidentInput(
            report_text="Fire detected in kitchen area",
            location_hint="Main Kitchen",
            reporter_role="staff"
        )
        assert incident.report_text == "Fire detected in kitchen area"
        assert incident.location_hint == "Main Kitchen"
        assert incident.reporter_role == "staff"
    
    def test_report_text_too_short(self):
        """Report text less than 3 chars should be rejected"""
        with pytest.raises(ValidationError):
            IncidentInput(report_text="ab", location_hint="Kitchen")
    
    def test_report_text_empty_whitespace(self):
        """Report text with only whitespace should be rejected"""
        with pytest.raises(ValidationError):
            IncidentInput(report_text="   ", location_hint="Kitchen")
    
    def test_location_none_allowed(self):
        """Location can be None (optional field)"""
        incident = IncidentInput(
            report_text="Smoke reported",
            location_hint=None
        )
        assert incident.location_hint is None


class TestIncidentClassificationValidation:
    """Test IncidentClassification model validation"""
    
    def test_valid_classification(self):
        """Valid classification should be accepted"""
        classification = IncidentClassification(
            incident_type="fire",
            severity="high",
            location="Main Lobby",
            summary="Active fire detected",
            responders_needed=["fire_team", "medical"],
            evacuation_required=True,
            confidence=0.95,
            ai_reasoning="Smoke and heat detected"
        )
        assert classification.incident_type == "fire"
        assert classification.severity == "high"
        assert classification.confidence == 0.95
    
    def test_invalid_incident_type(self):
        """Invalid incident type should be rejected"""
        with pytest.raises(ValidationError):
            IncidentClassification(
                incident_type="earthquake",
                severity="high",
                location="Kitchen",
                summary="Test",
                responders_needed=["fire"],
                evacuation_required=False,
                confidence=0.8
            )
    
    def test_invalid_severity(self):
        """Invalid severity should be rejected"""
        with pytest.raises(ValidationError):
            IncidentClassification(
                incident_type="fire",
                severity="extreme",
                location="Kitchen",
                summary="Test",
                responders_needed=["fire"],
                evacuation_required=False,
                confidence=0.8
            )
    
    def test_confidence_out_of_range_high(self):
        """Confidence > 1.0 should be rejected"""
        with pytest.raises(ValidationError):
            IncidentClassification(
                incident_type="fire",
                severity="high",
                location="Kitchen",
                summary="Test",
                responders_needed=["fire"],
                evacuation_required=False,
                confidence=1.5
            )
    
    def test_confidence_out_of_range_low(self):
        """Confidence < 0.0 should be rejected"""
        with pytest.raises(ValidationError):
            IncidentClassification(
                incident_type="fire",
                severity="high",
                location="Kitchen",
                summary="Test",
                responders_needed=["fire"],
                evacuation_required=False,
                confidence=-0.1
            )
    
    def test_empty_location_rejected(self):
        """Empty location should be rejected"""
        with pytest.raises(ValidationError):
            IncidentClassification(
                incident_type="fire",
                severity="high",
                location="",
                summary="Test",
                responders_needed=["fire"],
                evacuation_required=False,
                confidence=0.8
            )
    
    def test_empty_responders_rejected(self):
        """Empty responders list should be rejected"""
        with pytest.raises(ValidationError):
            IncidentClassification(
                incident_type="fire",
                severity="high",
                location="Kitchen",
                summary="Test",
                responders_needed=[],
                evacuation_required=False,
                confidence=0.8
            )
    
    def test_responder_deduplication(self):
        """Duplicate responders should be deduplicated"""
        classification = IncidentClassification(
            incident_type="fire",
            severity="high",
            location="Kitchen",
            summary="Multiple identical responders test",
            responders_needed=["fire", "fire", "medical"],
            evacuation_required=False,
            confidence=0.8
        )
        assert len(classification.responders_needed) == 2
        assert "fire" in classification.responders_needed
        assert "medical" in classification.responders_needed


class TestIncidentModel:
    """Test Incident model"""
    
    def test_incident_creation(self):
        """Incident should be creatable with valid input"""
        incident_input = IncidentInput(
            report_text="Fire alarm activated",
            location_hint="Floor 2"
        )
        incident = Incident(input=incident_input)
        assert incident.status == "detected"
        assert incident.input.report_text == "Fire alarm activated"
    
    def test_incident_default_status(self):
        """Incident should default to 'detected' status"""
        incident_input = IncidentInput(report_text="Cardiac arrest")
        incident = Incident(input=incident_input)
        assert incident.status == "detected"
        assert incident.lifecycle_state == "detected"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
