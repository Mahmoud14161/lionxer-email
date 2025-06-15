export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'ai' | 'auth';
}

export enum ApiKeyStatus {
  CHECKING = 'checking',
  LOADED = 'loaded',
  MISSING = 'missing'
}

export enum AuthStatus {
  IDLE = 'idle',
  LOADING_GAPI = 'loading_gapi',
  GAPI_LOADED = 'gapi_loaded',
  GAPI_ERROR = 'gapi_error',
  SIGNED_IN = 'signed_in',
  SIGNED_OUT = 'signed_out',
  AUTH_ERROR = 'auth_error'
}

export interface GoogleUser {
  email: string;
  name?: string;
  // Add other fields if needed
}