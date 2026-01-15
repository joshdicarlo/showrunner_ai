/**
 * Services Layer
 * 
 * This directory contains the service layer architecture:
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        React Components                         │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     adapters/ (React Hooks)                      │
 * │   useDiscovery, useGeneration, useDrive                         │
 * │   Provides: state management, loading states, error handling     │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                  Domain Services (Business Logic)                │
 * │   discoveryService, generationService, renderQueue, etc.        │
 * │   Provides: orchestration, validation, business rules            │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     api/ (API Clients)                           │
 * │   geminiClient, lumaClient, driveClient                         │
 * │   Provides: raw API calls, retry logic, authentication          │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    External APIs                                 │
 * │   Google AI (Gemini), Luma Labs, Google Drive                   │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Import patterns:
 * 
 * // For React components (preferred)
 * import { useDiscovery, useGeneration, useDrive } from './services/adapters';
 * 
 * // For non-React code or direct service access
 * import { discoverFromScript } from './services/discoveryService';
 * import { generateImage } from './services/generationService';
 * 
 * // For low-level client access (rare)
 * import { getGeminiClient, getLumaClient } from './services/api';
 */

// Re-export adapters (React hooks)
export * from './adapters';

// Re-export domain services
export * from './discoveryService';
export * from './generationService';

// Re-export API clients
export * from './api';
