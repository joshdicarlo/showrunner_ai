/**
 * Google Drive API Client
 * 
 * Low-level wrapper around the Google Drive and Sheets APIs.
 * Handles OAuth flow, mock mode for local development, and file operations.
 * 
 * This client is used by project and asset services for cloud storage.
 */

import { GOOGLE_CLIENT_ID } from "../../constants";

// --- Types ---

declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}

export interface DriveClientConfig {
    clientId?: string;
    mockMode?: boolean;
}

export interface FolderInfo {
    id: string;
    name: string;
}

export interface FileUploadResult {
    id: string;
    webViewLink?: string;
}

// --- Constants ---

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    'https://sheets.googleapis.com/$discovery/rest?version=v4'
];

// --- Client Class ---

class DriveClient {
    private config: DriveClientConfig;
    private tokenClient: any = null;
    private gapiInited = false;
    private gisInited = false;
    private isMock = false;

    constructor(config: DriveClientConfig = {}) {
        this.config = config;
        this.isMock = config.mockMode || false;
    }

    /**
     * Initialize Google API Client
     */
    async initialize(): Promise<boolean> {
        if (this.isMock) {
            console.log("[DriveClient] Running in Mock Mode");
            return true;
        }

        return new Promise((resolve) => {
            const clientId = this.config.clientId || GOOGLE_CLIENT_ID;
            
            const checkGapi = setInterval(() => {
                if (window.gapi && window.google) {
                    clearInterval(checkGapi);
                    
                    try {
                        window.gapi.load('client', async () => {
                            try {
                                await window.gapi.client.init({
                                    clientId,
                                    discoveryDocs: DISCOVERY_DOCS,
                                });
                                this.gapiInited = true;
                            } catch (e) {
                                console.warn("[DriveClient] GAPI Init failed (likely origin mismatch)");
                            }
                        });

                        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                            client_id: clientId,
                            scope: SCOPES,
                            callback: (resp: any) => {
                                if (resp.error) {
                                    console.warn("[DriveClient] OAuth Init Error:", resp);
                                }
                            },
                        });
                        this.gisInited = true;
                        resolve(true);
                    } catch (e) {
                        console.warn("[DriveClient] Google Scripts failed to load, using Mock Mode");
                        this.isMock = true;
                        resolve(true);
                    }
                }
            }, 100);
            
            // Timeout if scripts never load
            setTimeout(() => {
                clearInterval(checkGapi);
                if (!this.gapiInited && !this.isMock) {
                    console.warn("[DriveClient] GAPI load timed out");
                    resolve(true);
                }
            }, 5000);
        });
    }

    /**
     * Enable mock mode (offline operation)
     */
    enableMockMode(): void {
        this.isMock = true;
        console.log("[DriveClient] Mock/Offline Mode Enabled");
    }

    /**
     * Check if running in mock mode
     */
    isMockMode(): boolean {
        return this.isMock;
    }

    /**
     * Sign in to Google account
     */
    async signIn(): Promise<string> {
        if (this.isMock) {
            return "mock-token-offline";
        }

        if (!this.tokenClient) {
            this.enableMockMode();
            return "mock-token-fallback";
        }

        return new Promise((resolve) => {
            // 2 minutes timeout - multiple consent screens can take time
            const timeout = setTimeout(() => {
                console.warn("[DriveClient] Sign-in timed out. Falling back to Mock Mode.");
                this.enableMockMode();
                resolve("mock-token-timeout");
            }, 120000);

            try {
                this.tokenClient.callback = (resp: any) => {
                    clearTimeout(timeout);
                    if (resp.error) {
                        console.warn("[DriveClient] Auth Error, switching to Mock Mode:", resp);
                        this.enableMockMode();
                        resolve("mock-token-error");
                    } else {
                        resolve(resp.access_token);
                    }
                };

                if (window.gapi.client.getToken() === null) {
                    this.tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    this.tokenClient.requestAccessToken({ prompt: '' });
                }
            } catch (e) {
                clearTimeout(timeout);
                console.error("[DriveClient] Sign In Exception", e);
                this.enableMockMode();
                resolve("mock-token-exception");
            }
        });
    }

    /**
     * Find or create a folder in Drive
     */
    async findOrCreateFolder(name: string, parentId?: string): Promise<string> {
        if (this.isMock) {
            console.log(`[DriveClient Mock] Find/Create Folder: "${name}" inside "${parentId || 'root'}"`);
            return `mock-folder-${name.toLowerCase().replace(/\s/g, '-')}`;
        }

        try {
            // Search for existing folder
            let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
            if (parentId) {
                query += ` and '${parentId}' in parents`;
            }

            const response = await window.gapi.client.drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive',
            });

            if (response.result.files && response.result.files.length > 0) {
                return response.result.files[0].id;
            }

            // Create if not found
            const fileMetadata: any = {
                name,
                mimeType: 'application/vnd.google-apps.folder',
            };
            if (parentId) {
                fileMetadata.parents = [parentId];
            }

            const createRes = await window.gapi.client.drive.files.create({
                resource: fileMetadata,
                fields: 'id',
            });

            return createRes.result.id;
        } catch (e) {
            console.error("[DriveClient] Drive API Error", e);
            throw e;
        }
    }

    /**
     * List files in a folder
     */
    async listFiles(folderId: string, mimeType?: string): Promise<FolderInfo[]> {
        if (this.isMock) {
            console.log(`[DriveClient Mock] List Files in: ${folderId}`);
            return [];
        }

        let query = `'${folderId}' in parents and trashed=false`;
        if (mimeType) {
            query += ` and mimeType='${mimeType}'`;
        }

        const response = await window.gapi.client.drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive',
        });

        return (response.result.files || []).map((f: any) => ({
            id: f.id,
            name: f.name
        }));
    }

    /**
     * Upload a file to Drive
     */
    async uploadFile(
        folderId: string,
        filename: string,
        content: string | Blob,
        contentType: string
    ): Promise<FileUploadResult> {
        if (this.isMock) {
            console.log(`[DriveClient Mock] Uploading ${filename} to ${folderId}`);
            // Return a valid URL for display
            if (typeof content === 'string' && content.startsWith('data:')) {
                return { id: 'mock-file-id', webViewLink: content };
            }
            return { id: 'mock-file-id', webViewLink: "https://mock.drive.google.com/view/file-id" };
        }

        let fileContent: Blob;
        
        if (typeof content === 'string') {
            if (content.startsWith('data:')) {
                const res = await fetch(content);
                fileContent = await res.blob();
            } else {
                fileContent = new Blob([content], { type: contentType });
            }
        } else {
            fileContent = content;
        }

        const metadata = {
            name: filename,
            mimeType: contentType,
            parents: [folderId],
        };

        const accessToken = window.gapi.auth.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', fileContent);

        const res = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
            {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: form,
            }
        );
        
        const val = await res.json();
        return { id: val.id, webViewLink: val.webViewLink };
    }

    /**
     * Create a Google Spreadsheet
     */
    async createSpreadsheet(title: string, folderId?: string): Promise<string> {
        if (this.isMock) {
            console.log(`[DriveClient Mock] Creating Spreadsheet: ${title}`);
            return `mock-sheet-${title.toLowerCase().replace(/\s/g, '-')}`;
        }

        const sheetRes = await window.gapi.client.sheets.spreadsheets.create({
            resource: { properties: { title } },
            fields: 'spreadsheetId'
        });
        
        const sheetId = sheetRes.result.spreadsheetId;
        
        // Move to folder if specified
        if (folderId) {
            const file = await window.gapi.client.drive.files.get({
                fileId: sheetId,
                fields: 'parents'
            });
            const previousParents = file.result.parents.join(',');
            await window.gapi.client.drive.files.update({
                fileId: sheetId,
                addParents: folderId,
                removeParents: previousParents,
                fields: 'id, parents'
            });
        }

        return sheetId;
    }

    /**
     * Update spreadsheet values
     */
    async updateSpreadsheet(
        spreadsheetId: string,
        range: string,
        values: any[][]
    ): Promise<void> {
        if (this.isMock) {
            console.log(`[DriveClient Mock] Updating Sheet ${spreadsheetId}: ${values.length} rows`);
            return;
        }

        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
    }

    /**
     * Read spreadsheet values
     */
    async readSpreadsheet(spreadsheetId: string, range: string): Promise<any[][]> {
        if (this.isMock) {
            console.log(`[DriveClient Mock] Reading Sheet ${spreadsheetId}`);
            return [];
        }

        const response = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });

        return response.result.values || [];
    }

    /**
     * Find spreadsheet by name in a folder
     */
    async findSpreadsheet(name: string, folderId: string): Promise<string | null> {
        if (this.isMock) {
            return null;
        }

        const query = `mimeType='application/vnd.google-apps.spreadsheet' and name='${name}' and '${folderId}' in parents and trashed=false`;
        const response = await window.gapi.client.drive.files.list({
            q: query,
            fields: 'files(id)'
        });

        if (response.result.files && response.result.files.length > 0) {
            return response.result.files[0].id;
        }

        return null;
    }
}

// --- Singleton Instance ---

let clientInstance: DriveClient | null = null;

/**
 * Get the singleton Drive client instance
 */
export const getDriveClient = (config?: DriveClientConfig): DriveClient => {
    if (!clientInstance) {
        clientInstance = new DriveClient(config);
    }
    return clientInstance;
};

/**
 * Create a new Drive client with custom config
 */
export const createDriveClient = (config: DriveClientConfig): DriveClient => {
    return new DriveClient(config);
};

export default DriveClient;
