/**
 * Storage Module
 * 
 * Pluggable storage abstraction layer.
 * Supports Google Drive with hooks for future S3, Azure, etc.
 */

// Types
export * from './types';

// Providers
export { GoogleDriveStorage, googleDriveStorage } from './GoogleDriveStorage';

// Manager
export { storageManager } from './StorageManager';

// React Hook
export { useStorage, type UseStorageResult } from './useStorage';
