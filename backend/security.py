"""
Simple authentication and security utilities for CrisisHub API.
Provides bearer token validation for endpoint protection.
"""

import os
from fastapi import HTTPException, Header
from typing import Optional

# Demo API key - in production, use environment variables
DEMO_API_KEY = os.getenv('CRISISUB_API_KEY', 'demo-key-2026')


async def verify_api_token(authorization: Optional[str] = Header(None)) -> str:
    """
    Verify API bearer token from Authorization header.
    
    Expected format: Authorization: Bearer <token>
    For hackathon demo: Bearer demo-key-2026
    
    Args:
        authorization: Authorization header value
        
    Returns:
        Token string if valid
        
    Raises:
        HTTPException: 403 if token missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=403,
            detail="Missing Authorization header. Use: Authorization: Bearer <token>"
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=403,
            detail="Invalid Authorization format. Use: Bearer <token>"
        )
    
    token = parts[1]
    if token != DEMO_API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid API token"
        )
    
    return token
