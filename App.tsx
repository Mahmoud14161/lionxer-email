

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Button from './components/Button';
import TextInput from './components/TextInput';
import TextAreaInput from './components/TextAreaInput';
import LogItem from './components/LogItem';
import { LogEntry, ApiKeyStatus, AuthStatus, GoogleUser } from './types';
import { initializeGemini, generateEmailBody } from './services/geminiService';

// User-provided Google Client ID, hardcoded as per request.
// Standard practice is to use process.env.GOOGLE_CLIENT_ID for better flexibility and security.
const GOOGLE_CLIENT_ID = "1069535770551-4bgihvoot1h0ap38n193j0bi57r4aa5b.apps.googleusercontent.com"; 
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

declare global {
  interface Window {
    gapi: any;
  }
}

const formatFileSize = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Icon components
const LionxerEmailIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
  </svg>
);

const LionxerShieldIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.073 11.335" />
    <path d="M15 19l2 2l4 -4" />
  </svg>
);


const App: React.FC = () => {
  const [recipients, setRecipients] = useState<string>('');
  const [subject, setSubject] = useState<string>('Exciting News!');
  const [body, setBody] = useState<string>('Dear recipient,\n\nWe have some exciting news to share with you...\n\nBest regards,\nOur Team');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [geminiApiKeyStatus, setGeminiApiKeyStatus] = useState<ApiKeyStatus>(ApiKeyStatus.CHECKING);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.IDLE);
  const [currentUser, setCurrentUser] = useState<GoogleUser | null>(null);
  const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState<boolean>(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gapiAuthInstance = useRef<any>(null);
  const prevAuthStatusRef = useRef<AuthStatus>(authStatus);
  const gapiLoadAttemptedRef = useRef<boolean>(false); // Ref to track GAPI load attempt

  useEffect(() => {
    prevAuthStatusRef.current = authStatus;
  }, [authStatus]);

  const addLog = useCallback((message: string, type: LogEntry['type']) => {
    console.log(`[LIONXER EMAIL Log - ${type.toUpperCase()}]: ${message}`); // Enhanced logging
    setLogs(prevLogs => [
      ...prevLogs,
      { id: Date.now().toString() + Math.random().toString(), timestamp: new Date().toLocaleTimeString(), message, type }
    ]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Initialize Gemini AI Service
  useEffect(() => {
    addLog("Attempting to initialize AI service (Gemini)...", 'ai');
    const initError = initializeGemini(); 
    if (initError) {
      setGeminiApiKeyStatus(ApiKeyStatus.MISSING); // Represents a general failure state now
      addLog(`AI Service Initialization Failed: ${initError}. AI features will be disabled.`, 'error');
    } else {
      setGeminiApiKeyStatus(ApiKeyStatus.LOADED);
      addLog("AI Service Initialized Successfully. Gemini API Key seems valid.", 'success');
    }
  }, [addLog]);

  const updateSigninStatus = useCallback((isSignedIn: boolean) => {
    if (isSignedIn && gapiAuthInstance.current) {
        const profile = gapiAuthInstance.current.currentUser.get().getBasicProfile();
        setCurrentUser({ email: profile.getEmail(), name: profile.getName() });
        setAuthStatus(AuthStatus.SIGNED_IN);
        addLog(`Signed in to Google as ${profile.getEmail()}.`, 'success');
    } else { // User is signed out or GAPI instance not ready
        const wasPreviouslySignedIn = prevAuthStatusRef.current === AuthStatus.SIGNED_IN;
        setCurrentUser(null);
        setAuthStatus(AuthStatus.SIGNED_OUT); 
        if (wasPreviouslySignedIn) {
            addLog("Signed out from Google.", 'auth');
        }
        // If GAPI just loaded and user is not signed in, UI will reflect SIGNED_OUT state.
        // No specific log here unless wasPreviouslySignedIn.
    }
  }, [addLog]);

  const initGoogleClient = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) { 
      addLog("Google Client ID is missing. Please ensure it's set in the code.", 'error');
      console.error("CRITICAL: Google Client ID is missing in the application code.");
      setAuthStatus(AuthStatus.GAPI_ERROR);
      return;
    }
    try {
      addLog("Attempting gapi.client.init...", 'auth');
      await window.gapi.client.init({
        clientId: GOOGLE_CLIENT_ID,
        scope: GMAIL_SEND_SCOPE,
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest"]
      });
      addLog("gapi.client.init successful. Attempting gapi.auth2.getAuthInstance...", 'auth');
      gapiAuthInstance.current = window.gapi.auth2.getAuthInstance();
      if (!gapiAuthInstance.current) {
          throw new Error("gapi.auth2.getAuthInstance() returned null or undefined. Auth2 may not have initialized correctly.");
      }
      addLog("gapi.auth2.getAuthInstance successful.", 'auth');
      setAuthStatus(AuthStatus.GAPI_LOADED);
      addLog("Google API Client initialized successfully.", 'auth');
      
      gapiAuthInstance.current.isSignedIn.listen(updateSigninStatus);
      updateSigninStatus(gapiAuthInstance.current.isSignedIn.get());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error initializing Google API Client: ${errorMessage}`, 'error');
      console.error("Full error during Google API Client initialization:", error); // Log the full error object
      setAuthStatus(AuthStatus.GAPI_ERROR);
    }
  }, [addLog, updateSigninStatus]);

  useEffect(() => {
    if (gapiLoadAttemptedRef.current) {
        // addLog("GAPI loading sequence already attempted. Skipping.", 'auth'); // Reduced verbosity
        return;
    }
    gapiLoadAttemptedRef.current = true; // Mark as attempted

    setAuthStatus(AuthStatus.LOADING_GAPI);
    addLog("Starting GAPI loading sequence...", 'auth');

    const gapiLoadErrorCallback = (error: any) => {
        const errorMessage = error?.details || (error instanceof Error ? error.message : String(error));
        addLog(`Error loading GAPI modules (client:auth2): ${errorMessage}`, 'error');
        console.error("Full error during gapi.load('client:auth2'):", error);
        setAuthStatus(AuthStatus.GAPI_ERROR);
    };
    
    const gapiLoadTimeoutCallback = () => {
        addLog("Timeout occurred while loading GAPI modules (client:auth2).", 'error');
        console.error("Timeout: gapi.load('client:auth2') did not complete in 7 seconds.");
        setAuthStatus(AuthStatus.GAPI_ERROR);
    };

    const attemptInitGapi = () => {
      if (window.gapi && window.gapi.load) {
        addLog("window.gapi.load detected. Calling gapi.load('client:auth2', ...)", 'auth');
        window.gapi.load('client:auth2', {
            callback: initGoogleClient, // Success callback
            onerror: gapiLoadErrorCallback, // Error callback for module loading
            timeout: 7000, // 7-second timeout for loading GAPI modules
            ontimeout: gapiLoadTimeoutCallback, // Timeout callback
        });
        return true;
      }
      // addLog("window.gapi or window.gapi.load not yet available.", 'auth'); // Reduced verbosity
      return false;
    };

    if (attemptInitGapi()) {
      return; 
    }

    let attempts = 0;
    const maxAttempts = 50; // Approx 5 seconds (50 * 100ms) for polling for window.gapi itself
    addLog(`Polling for window.gapi.load, max attempts: ${maxAttempts}`, 'auth');
    const intervalId = setInterval(() => {
      attempts++;
      // addLog(`GAPI poll attempt: ${attempts}`, 'auth'); // Reduced verbosity
      if (attemptInitGapi()) {
        clearInterval(intervalId);
        addLog("GAPI successfully loaded and initGoogleClient scheduled via polling.", 'auth');
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        addLog("Failed to detect Google API script (window.gapi.load) after multiple attempts. Check console for script loading errors from apis.google.com.", 'error');
        console.error("CRITICAL: window.gapi.load not found after polling. The Google API script from index.html might have failed to load.");
        setAuthStatus(AuthStatus.GAPI_ERROR);
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [addLog, initGoogleClient]);


  const handleSignIn = async () => {
    if (gapiAuthInstance.current) {
      setIsGoogleAuthLoading(true);
      try {
        addLog("Attempting Google Sign-In...", 'auth');
        await gapiAuthInstance.current.signIn();
        // updateSigninStatus will be called by the listener
      } catch (error: any) {
        // Error handling for signIn usually involves checking error.error string
        if (error.error === 'popup_closed_by_user') {
          addLog('Google Sign-in popup closed by user.', 'info');
           // updateSigninStatus will handle setting state to SIGNED_OUT if not already.
        } else if (error.error === 'access_denied') {
           addLog('Google Sign-in access denied by user.', 'error');
           setAuthStatus(AuthStatus.AUTH_ERROR); // Explicitly set auth error
        } else {
          const errorMessage = error.message || error.details || String(error);
          addLog(`Google Sign-in error: ${errorMessage}`, 'error');
          console.error("Google Sign-In Error object:", error);
          setAuthStatus(AuthStatus.AUTH_ERROR);
        }
      } finally {
        setIsGoogleAuthLoading(false);
      }
    } else {
      addLog("Google Auth instance not ready. Cannot sign in. Possible GAPI initialization failure.", 'error');
      // If GOOGLE_CLIENT_ID is present but instance is not ready, it's a GAPI_ERROR.
      if (GOOGLE_CLIENT_ID && authStatus !== AuthStatus.GAPI_ERROR && authStatus !== AuthStatus.LOADING_GAPI) {
          setAuthStatus(AuthStatus.GAPI_ERROR); 
          addLog("Triggering GAPI_ERROR state due to missing auth instance at sign-in attempt.", 'error');
      }
    }
  };

  const handleSignOut = () => {
    if (gapiAuthInstance.current) {
      gapiAuthInstance.current.signOut();
      // updateSigninStatus will be called by the listener
    }
  };

  const handleGenerateWithAI = async () => {
    if (geminiApiKeyStatus !== ApiKeyStatus.LOADED) {
      addLog("Cannot generate content: AI Service not available (Gemini API Key might be invalid or initialization failed).", 'error');
      return;
    }
    if (!subject.trim()) {
      addLog("Please enter a subject to help the AI generate relevant content.", 'error');
      return;
    }
    setIsGeneratingAI(true);
    addLog("Generating email body with AI (Gemini)...", 'ai');
    try {
      const generatedBody = await generateEmailBody(subject);
      setBody(generatedBody);
      addLog("AI successfully generated email body.", 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error generating email body with AI: ${errorMessage}`, 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setAttachedFiles(prevFiles => [...prevFiles, ...newFiles]);
      addLog(`Added ${newFiles.length} file(s): ${newFiles.map(f => f.name).join(', ')}`, 'info');
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    const removedFile = attachedFiles[indexToRemove];
    setAttachedFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    addLog(`Removed file: ${removedFile.name}`, 'info');
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const sendEmailWithGmail = async (to: string, from: string, emailSubject: string, emailBody: string, files: File[]): Promise<void> => {
    const boundary = "----=" + Date.now().toString(16);
    let rawEmail = `From: <${from}>\r\n`;
    rawEmail += `To: <${to}>\r\n`;
    rawEmail += `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(emailSubject)))}?=\r\n`;
    rawEmail += `MIME-Version: 1.0\r\n`;
    rawEmail += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    rawEmail += `--${boundary}\r\n`;
    rawEmail += `Content-Type: text/html; charset="UTF-8"\r\n`;
    rawEmail += `Content-Transfer-Encoding: base64\r\n\r\n`;
    rawEmail += `${btoa(unescape(encodeURIComponent(emailBody.replace(/\n/g, '<br>'))))}\r\n`;

    for (const file of files) {
      const fileBase64 = await readFileAsBase64(file);
      rawEmail += `--${boundary}\r\n`;
      rawEmail += `Content-Type: ${file.type}; name="${file.name}"\r\n`;
      rawEmail += `Content-Disposition: attachment; filename="${file.name}"\r\n`;
      rawEmail += `Content-Transfer-Encoding: base64\r\n\r\n`;
      rawEmail += `${fileBase64}\r\n`;
    }

    rawEmail += `--${boundary}--`;

    const base64EncodedEmail = btoa(rawEmail).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await window.gapi.client.gmail.users.messages.send({
      userId: 'me',
      resource: {
        raw: base64EncodedEmail
      }
    });
  };
  
  const handleSendEmails = async () => {
    if (authStatus !== AuthStatus.SIGNED_IN || !currentUser) {
      addLog("Please sign in with Google to send emails.", 'error');
      return;
    }

    setIsSending(true);
    addLog("Starting email sending process...", 'info');

    const recipientArray = recipients.split(/[\n,;]+/).map(r => r.trim()).filter(r => r);

    if (recipientArray.length === 0) {
      addLog("No recipients provided. Please add email addresses.", 'error');
      setIsSending(false);
      return;
    }

    addLog(`Found ${recipientArray.length} potential recipients.`, 'info');
    if (attachedFiles.length > 0) {
      addLog(`Preparing to send with ${attachedFiles.length} attachment(s): ${attachedFiles.map(f => f.name).join(', ')}.`, 'info');
    }

    for (let i = 0; i < recipientArray.length; i++) {
      const email = recipientArray[i];
      if (!validateEmail(email)) {
        addLog(`Skipping invalid email format: ${email}`, 'error');
        if (i < recipientArray.length - 1) { 
             addLog(`Waiting 60 seconds before processing next recipient (due to skip)...`, 'info');
             await new Promise(resolve => setTimeout(resolve, 60000));
        }
        continue;
      }
      
      let sendLogMessage = `Sending email ${i + 1} of ${recipientArray.length} to: ${email}`;
      if (attachedFiles.length > 0) {
        sendLogMessage += ` with ${attachedFiles.length} attachment(s).`;
      } else {
        sendLogMessage += '.';
      }
      addLog(sendLogMessage, 'info');
      
      try {
        await sendEmailWithGmail(email, currentUser.email, subject, body, attachedFiles);
        addLog(`Email successfully sent to ${email}.`, 'success');
      } catch (error) {
        const errorResponse = error as any; // Cast to any to access potential Google API error structure
        let detailMessage = "An unknown error occurred.";
        if (errorResponse && errorResponse.result && errorResponse.result.error) {
            detailMessage = `Code ${errorResponse.result.error.code}: ${errorResponse.result.error.message}`;
        } else if (error instanceof Error) {
            detailMessage = error.message;
        } else {
            detailMessage = String(error);
        }
        addLog(`Failed to send email to ${email}: ${detailMessage}`, 'error');
        console.error(`Gmail send error for ${email}:`, errorResponse);
      }

      if (i < recipientArray.length - 1) {
        addLog(`Waiting 60 seconds before sending the next email...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }

    addLog("Bulk email sending process complete.", 'success');
    setIsSending(false);
  };
  
  const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  );

  const PaperAirplaneIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );

  const PaperClipIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3.375 3.375 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.122 2.122l7.81-7.81" />
    </svg>
  );
  
  const XMarkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );

  const GoogleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg viewBox="0 0 48 48" {...props}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59L2.56 13.22C1.22 16.25 0 19.98 0 24c0 4.02 1.22 7.75 2.56 10.78l7.97-6.19z"></path>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
      <path fill="none" d="M0 0h48v48H0z"></path>
    </svg>
  );

  const ShieldAlertIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => ( 
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
    </svg>
  );

  const LoadingSpinner: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
      <svg className="animate-spin h-4 w-4 mr-2 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
  );

  const StatusMessages: React.FC = () => (
    <div className="space-y-2 mb-4 w-full max-w-xl mx-auto">
      {geminiApiKeyStatus === ApiKeyStatus.CHECKING && (
        <div className="p-3 text-sm text-sky-300 bg-sky-900/50 rounded-lg flex items-center" role="status">
          <LoadingSpinner /> Checking Gemini API Key status...
        </div>
      )}
      {geminiApiKeyStatus === ApiKeyStatus.MISSING && ( 
        <div className="p-3 text-sm text-red-300 bg-red-900/50 rounded-lg flex items-center" role="alert">
           <ShieldAlertIcon className="w-4 h-4 mr-2 text-red-400"/>
           Gemini API Key initialization failed. AI features are disabled. Please check if the key is valid.
        </div>
      )}
      {!GOOGLE_CLIENT_ID && ( // This condition should ideally not be met if GOOGLE_CLIENT_ID is hardcoded and valid
        <div className="p-3 text-sm text-red-300 bg-red-900/50 rounded-lg flex items-center" role="alert">
           <ShieldAlertIcon className="w-4 h-4 mr-2 text-red-400"/>
           Google Client ID not found. Sign-in and email sending are disabled. Ensure it's correctly set in the code.
        </div>
      )}
      {authStatus === AuthStatus.LOADING_GAPI && GOOGLE_CLIENT_ID && (
        <div className="p-3 text-sm text-sky-300 bg-sky-900/50 rounded-lg flex items-center" role="status">
          <LoadingSpinner /> Initializing Google Sign-In...
        </div>
      )}
      {authStatus === AuthStatus.GAPI_ERROR && GOOGLE_CLIENT_ID && (
         <div className="p-3 text-sm text-red-300 bg-red-900/50 rounded-lg flex items-center" role="alert">
           <ShieldAlertIcon className="w-4 h-4 mr-2 text-red-400"/>
           Error initializing Google Sign-In. Check console for details. Email sending disabled.
        </div>
      )}
      {authStatus === AuthStatus.AUTH_ERROR && GOOGLE_CLIENT_ID && (
         <div className="p-3 text-sm text-red-300 bg-red-900/50 rounded-lg flex items-center" role="alert">
           <ShieldAlertIcon className="w-4 h-4 mr-2 text-red-400"/>
           Google Sign-in error. Please try again.
        </div>
      )}
    </div>
  );


  if (authStatus !== AuthStatus.SIGNED_IN || !currentUser) {
    // Render Sign-In View
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-2">
              <LionxerEmailIcon className="h-10 w-10 sm:h-12 sm:w-12 text-blue-400" />
              <LionxerShieldIcon className="h-10 w-10 sm:h-12 sm:w-12 text-green-400" />
              <h1 className="text-4xl sm:text-5xl font-bold text-sky-400">LIONXER EMAIL</h1>
            </div>
            <p className="text-slate-400 mt-2">Sign in with Google to begin sending emails securely.</p>
        </div>
        
        <StatusMessages />

        {(authStatus === AuthStatus.GAPI_LOADED || authStatus === AuthStatus.SIGNED_OUT || authStatus === AuthStatus.AUTH_ERROR) && GOOGLE_CLIENT_ID && (
           <Button 
            onClick={handleSignIn} 
            variant='secondary' 
            icon={<GoogleIcon className="w-5 h-5"/>} 
            className="bg-white text-slate-700 hover:bg-slate-100 py-2.5 px-6 text-base"
            isLoading={isGoogleAuthLoading}
            disabled={isGoogleAuthLoading || !GOOGLE_CLIENT_ID} 
          >
            Sign in with Google
          </Button>
        )}
         <footer className="text-center mt-12 text-slate-500 text-sm absolute bottom-8">
            <p>&copy; {new Date().getFullYear()} LIONXER EMAIL.</p>
        </footer>
         <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
          .bg-slate-850 { background-color: #161e2b; }
        `}</style>
      </div>
    );
  }

  // Render Main Application View (when signed in)
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl">
        <header className="mb-6 text-center">
          <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-2">
            <LionxerEmailIcon className="h-10 w-10 sm:h-12 sm:w-12 text-blue-400" />
            <LionxerShieldIcon className="h-10 w-10 sm:h-12 sm:w-12 text-green-400" />
            <h1 className="text-4xl sm:text-5xl font-bold text-sky-400">LIONXER EMAIL</h1>
          </div>
          <p className="text-slate-400 mt-2">Craft, enhance with AI, and send your email campaigns securely via Gmail.</p>
        </header>

        <div className="space-y-2 mb-4">
          {geminiApiKeyStatus === ApiKeyStatus.MISSING && ( 
            <div className="p-3 text-sm text-red-300 bg-red-900/50 rounded-lg flex items-center" role="alert">
               <ShieldAlertIcon className="w-4 h-4 mr-2 text-red-400"/>
              Gemini API Key initialization failed. AI features are disabled. Please check if the key is valid.
            </div>
          )}
          {authStatus === AuthStatus.SIGNED_IN && currentUser && (
            <div className="p-3 text-sm text-green-300 bg-green-900/50 rounded-lg flex items-center justify-between" role="status">
              <span>Signed in as: <strong className="font-medium">{currentUser.email}</strong></span>
              <Button onClick={handleSignOut} variant="secondary" className="py-1 px-2 text-xs">Sign Out</Button>
            </div>
          )}
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl space-y-4">
            <h2 className="text-2xl font-semibold text-sky-300 border-b border-slate-700 pb-2 mb-4">Compose Email</h2>
            <TextAreaInput
              label="Recipients (one per line or comma-separated)"
              id="recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="e.g., user1@example.com, user2@example.com"
              rows={3}
              aria-describedby="recipients-description"
            />
             <p id="recipients-description" className="text-xs text-slate-400 -mt-2 mb-2">Enter multiple emails separated by commas, semicolons, or new lines.</p>

            <TextInput
              label="Subject"
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your email subject"
            />
            <TextAreaInput
              label="Body (HTML supported)"
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here. You can use HTML tags."
              rows={8}
            />

            <div>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                id="file-input"
                aria-labelledby="attach-files-button"
              />
              <Button
                id="attach-files-button"
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
                icon={<PaperClipIcon className="w-5 h-5"/>}
                className="w-full sm:w-auto text-sm py-1.5 px-3"
                aria-controls="selected-files-list" 
              >
                Attach Files
              </Button>

              {attachedFiles.length > 0 && (
                <div id="selected-files-list" className="mt-3 space-y-1" aria-live="polite">
                  <h3 className="text-xs font-medium text-slate-400 mb-1">Attached Files:</h3>
                  <ul className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                    {attachedFiles.map((file, index) => (
                      <li 
                        key={`${file.name}-${file.lastModified}-${index}`} 
                        className="flex justify-between items-center text-xs bg-slate-700/80 hover:bg-slate-700 px-2 py-1 rounded group"
                      >
                        <span className="truncate" title={file.name}>
                          {file.name} <span className="text-slate-400">({formatFileSize(file.size)})</span>
                        </span>
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="ml-2 text-slate-500 hover:text-red-400 focus:outline-none focus:ring-1 focus:ring-red-500 rounded-full p-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove ${file.name}`}
                          title={`Remove ${file.name}`}
                        >
                          <XMarkIcon className="w-3.5 h-3.5"/>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-3">
              <Button
                onClick={handleGenerateWithAI}
                isLoading={isGeneratingAI}
                disabled={isSending || geminiApiKeyStatus !== ApiKeyStatus.LOADED}
                variant="secondary"
                icon={<SparklesIcon className="w-5 h-5"/>}
                className="w-full sm:w-auto"
              >
                Generate with AI
              </Button>
              <Button
                onClick={handleSendEmails}
                isLoading={isSending}
                disabled={isGeneratingAI || authStatus !== AuthStatus.SIGNED_IN || !GOOGLE_CLIENT_ID}
                icon={<PaperAirplaneIcon className="w-5 h-5"/>}
                className="w-full sm:w-auto"
              >
                Send Emails
              </Button>
            </div>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg shadow-xl flex flex-col">
            <h2 className="text-2xl font-semibold text-sky-300 border-b border-slate-700 pb-2 mb-4">Activity Log</h2>
            <div className="flex-grow h-96 min-h-[24rem] overflow-y-auto bg-slate-850 rounded-md p-1 custom-scrollbar">
              {logs.length === 0 && <p className="text-slate-400 text-center py-4">No activity yet. Start by composing an email.</p>}
              {logs.map((log) => (
                <LogItem key={log.id} log={log} />
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
        <footer className="text-center mt-12 text-slate-500 text-sm">
            <p>&copy; {new Date().getFullYear()} LIONXER EMAIL.</p>
             <p>Uses Gemini API for AI content generation and Gmail API for sending emails.</p>
        </footer>
      </div>
       <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e293b; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; 
        }
        .bg-slate-850 { 
          background-color: #161e2b; 
        }
      `}</style>
    </div>
  );
};

export default App;