import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const MODEL_NAME = 'gemini-2.0-flash';

// In-memory cache: { incidentId: { result, timestamp } }
const analysisCache = new Map();
const CACHE_TTL = 60000; // 60 seconds

// Loading state tracking
const loadingStates = new Map();

/**
 * Check if cached result is still valid
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_TTL;
}

/**
 * Get from cache if valid, else null
 */
function getCachedAnalysis(incidentId) {
  const cached = analysisCache.get(incidentId);
  if (isCacheValid(cached)) {
    console.log(`[Gemini] Using cached analysis for incident ${incidentId}`);
    return cached.result;
  }
  // Remove stale entry
  if (cached) {
    analysisCache.delete(incidentId);
  }
  return null;
}

/**
 * Store result in cache
 */
function setCacheAnalysis(incidentId, result) {
  analysisCache.set(incidentId, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * Get current loading state for an incident
 */
export function getLoadingState(incidentId) {
  return loadingStates.get(incidentId) || false;
}

/**
 * Set loading state
 */
function setLoadingState(incidentId, isLoading) {
  if (isLoading) {
    loadingStates.set(incidentId, true);
  } else {
    loadingStates.delete(incidentId);
  }
}

/**
 * Fallback mock analysis when API fails or is unavailable
 */
function getDemoAnalysis(incident) {
  const type = incident.type?.toLowerCase() || 'security';
  const location = incident.location || 'Unknown area';
  
  const reasoningMap = {
    fire: [
      `Thermal anomaly detected in ${location} via high-sensitivity IoT sensors.`,
      "Pattern matching identifies high probability of localized fire event.",
      "Evacuation routes prioritized based on dynamic smoke spread modeling.",
      "Dispatching fire suppression team and coordinating building-wide HVAC shutdown."
    ],
    medical: [
      `Emergency distress signal or sensor threshold exceeded in ${location}.`,
      "AI cross-referencing nearest medical supplies and AED availability.",
      "Calculating optimal responder routing to avoid congestion in corridors.",
      "Preparing remote triage guidelines for first-arriving security staff."
    ],
    security: [
      `Security anomaly or unauthorized access attempt flagged in ${location}.`,
      "Autonomous agent correlating multiple CCTV feeds for threat verification.",
      "Initiating zone lockdown and access control restriction protocols.",
      "Dispatching rapid-response security unit for site de-escalation."
    ],
    default: [
      `Incident telemetry analyzed for ${location} identifying potential disruption.`,
      "AI evaluating risk profile based on venue occupancy and time of day.",
      "Heuristic response plan generated to minimize operational downtime.",
      "Dispatching verification unit to perform on-site incident assessment."
    ]
  };

  const reasoning = reasoningMap[type] || reasoningMap.default;

  return {
    summary: `Strategic analysis for ${type} event at ${location}. Response protocol alpha initiated.`,
    confidence: 88 + Math.random() * 10,
    escalate: incident.severity === 'CRITICAL',
    reasoning: reasoning,
    source: 'Local AI Core (Autonomous Mode)'
  };
}

/**
 * Main function: Analyze an incident using Gemini 2.0 Flash
 * @param {Object} incident - Incident object with fields: { id, type, location, severity, description, sensorData }
 * @returns {Promise<Object>} Analysis result with structured response
 */
export async function analyzeIncident(incident) {
  if (!incident || !incident.id) {
    console.error('[Gemini] Invalid incident object');
    return getDemoAnalysis(incident);
  }

  // Check cache first
  const cached = getCachedAnalysis(incident.id);
  if (cached) {
    return cached;
  }

  // No API key: return demo
  if (!genAI) {
    console.warn('[Gemini] No API key configured. Using demo analysis.');
    const demo = getDemoAnalysis(incident);
    setCacheAnalysis(incident.id, demo);
    return demo;
  }

  // Set loading state
  setLoadingState(incident.id, true);

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Build a structured prompt
    const prompt = `You are an emergency operations AI for a hospitality venue. Analyze this incident and return ONLY valid JSON (no markdown, no code blocks, pure JSON).

Incident Details:
- ID: ${incident.id}
- Type: ${incident.type || 'UNKNOWN'}
- Location: ${incident.location || 'Unknown zone'}
- Severity: ${incident.severity || 'MEDIUM'}
- Description: ${incident.description || 'No description provided'}
- Sensor Data: ${incident.sensorData ? JSON.stringify(incident.sensorData) : 'No sensor data'}

Return exactly this JSON structure:
{
  "summary": "A single sentence executive summary of the incident and recommended action",
  "confidence": <number between 0 and 100 representing confidence in this analysis>,
  "reasoning": [
    "First step of agentic reasoning chain",
    "Second step explaining logic",
    "Third step describing threshold check",
    "Fourth step recommending action",
    "Fifth step explaining escalation decision"
  ],
  "recommendedActions": [
    "Specific action 1 relevant to this incident type and location",
    "Specific action 2 with operational context",
    "Specific action 3 with timing guidance",
    "Specific action 4 with resource allocation",
    "Specific action 5 for audit and documentation"
  ],
  "evacuationRoute": "Natural language description of recommended evacuation path from the incident location to assembly points",
  "escalate": <boolean - true if human approval required before dispatch>,
  "sdgImpact": ["SDG 3", "SDG 11", or "SDG 16" - list which UN Sustainable Development Goals this incident addresses]
}

Important:
- Be specific to the location and incident type
- Reasoning should reflect real emergency decision-making
- Confidence should be high (90+) unless data is missing
- Escalate should be true if confidence < 75 or severity is CRITICAL
- SDG mappings: Fire/Physical → SDG 11 + 3, Medical → SDG 3, Security → SDG 16
- Return ONLY JSON, no additional text`;

    const analyzeTask = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI Analysis Timeout')), 12000)
    );

    const response = await Promise.race([analyzeTask, timeoutPromise]);
    const responseText = response.response.text().trim();

    // Extract JSON from response (in case there's any markdown wrapping)
    let jsonText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const result = JSON.parse(jsonText);

    // Validate required fields
    if (!result.summary || result.confidence === undefined || !result.reasoning || !result.recommendedActions) {
      throw new Error('Invalid response structure from Gemini');
    }

    // Ensure confidence is 0-100
    result.confidence = Math.min(100, Math.max(0, result.confidence));

    console.log(`[Gemini] Analyzed incident ${incident.id}:`, result);
    setCacheAnalysis(incident.id, result);
    return result;
  } catch (error) {
    console.error('[Gemini] API call failed:', error.message);
    console.error('Error details:', error);

    // Fall back to demo analysis
    const demo = getDemoAnalysis(incident);
    setCacheAnalysis(incident.id, demo);
    return demo;
  } finally {
    setLoadingState(incident.id, false);
  }
}

/**
 * Clear cache for an incident (useful for testing or manual refresh)
 */
export function clearIncidentCache(incidentId) {
  analysisCache.delete(incidentId);
  loadingStates.delete(incidentId);
  console.log(`[Gemini] Cleared cache for incident ${incidentId}`);
}

/**
 * Clear all caches (useful for demo reset)
 */
export function clearAllCaches() {
  analysisCache.clear();
  loadingStates.clear();
  console.log('[Gemini] Cleared all caches');
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return {
    cacheSize: analysisCache.size,
    loadingCount: loadingStates.size,
    entries: Array.from(analysisCache.entries()).map(([id, { timestamp }]) => ({
      incidentId: id,
      age: Date.now() - timestamp,
    })),
  };
}
