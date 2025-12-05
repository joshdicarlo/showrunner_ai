
import { GOOGLE_CLIENT_ID } from "../constants";
import { Project, ProjectAsset } from "../types";

// Types for GAPI
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', 'https://sheets.googleapis.com/$discovery/rest?version=v4'];

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let isMock = false;

/**
 * Initialize Google API Client
 */
export const initGapi = (): Promise<boolean> => {
    return new Promise((resolve) => {
        const checkGapi = setInterval(() => {
            if (window.gapi && window.google) {
                clearInterval(checkGapi);
                
                try {
                    window.gapi.load('client', async () => {
                        try {
                            await window.gapi.client.init({
                                clientId: GOOGLE_CLIENT_ID,
                                discoveryDocs: DISCOVERY_DOCS,
                            });
                            gapiInited = true;
                        } catch (e) {
                            console.warn("GAPI Init failed (likely origin mismatch), defaulting to Mock Mode");
                            // Don't auto-enable mock here, let user choose
                        }
                    });

                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: GOOGLE_CLIENT_ID,
                        scope: SCOPES,
                        callback: (resp: any) => {
                            if (resp.error) {
                                console.warn("OAuth Init Error:", resp);
                            }
                        },
                    });
                    gisInited = true;
                    resolve(true);
                } catch (e) {
                    console.warn("Google Scripts failed to load, using Mock Mode");
                    isMock = true;
                    resolve(true);
                }
            }
        }, 100);
        
        // Timeout if scripts never load
        setTimeout(() => {
            clearInterval(checkGapi);
            if (!gapiInited && !isMock) {
                console.warn("GAPI load timed out");
                // isMock = true; 
                resolve(true);
            }
        }, 5000);
    });
};

export const enableMockMode = () => {
    isMock = true;
    console.log("Google Drive Service: Mock/Offline Mode Enabled");
}

export const isMockMode = () => isMock;

export const signIn = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (isMock) {
            resolve("mock-token-offline");
            return;
        }

        if (!tokenClient) {
            enableMockMode();
            resolve("mock-token-fallback");
            return;
        }

        // Setup a short timeout. If popup is blocked or user closes it on error, we fallback.
        const timeout = setTimeout(() => {
            console.warn("Sign-in timed out. Falling back to Mock Mode.");
            enableMockMode();
            resolve("mock-token-timeout");
        }, 8000); // 8 seconds

        try {
            // Override callback for this specific request
            tokenClient.callback = (resp: any) => {
                clearTimeout(timeout);
                if (resp.error) {
                    console.warn("Auth Error, switching to Mock Mode:", resp);
                    enableMockMode();
                    resolve("mock-token-error");
                } else {
                    resolve(resp.access_token);
                }
            };

            if (window.gapi.client.getToken() === null) {
                tokenClient.requestAccessToken({prompt: 'consent'});
            } else {
                tokenClient.requestAccessToken({prompt: ''});
            }
        } catch (e) {
            clearTimeout(timeout);
            console.error("Sign In Exception", e);
            enableMockMode();
            resolve("mock-token-exception");
        }
    });
};

/**
 * Helper: Find or Create Folder (Mock Aware)
 */
const findOrCreateFolder = async (name: string, parentId?: string): Promise<string> => {
    if (isMock) {
        console.log(`[Mock Drive] Find/Create Folder: "${name}" inside "${parentId || 'root'}"`);
        return `mock-folder-${name.toLowerCase().replace(/\s/g, '-')}`;
    }

    try {
        // 1. Search
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

        // 2. Create if not found
        const fileMetadata: any = {
            name: name,
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
        console.error("Drive API Error", e);
        throw e;
    }
};

/**
 * Initialize Project Structure
 */
export const createProjectDriveStructure = async (projectName: string): Promise<{
    rootId: string,
    projectId: string,
    dbId: string,
    folders: Record<string, string>
}> => {
    if (isMock) {
        console.log(`[Mock Drive] Creating Structure for: ${projectName}`);
        const mockFolders = {
            'Scripts': 'mock-scripts-id',
            'Cast': 'mock-cast-id',
            'Sets': 'mock-sets-id',
            'Story': 'mock-story-id',
            'Prod': 'mock-prod-id'
        };
        return {
            rootId: 'mock-root-id',
            projectId: 'mock-project-id',
            dbId: 'mock-db-sheet-id',
            folders: mockFolders
        };
    }

    // Real API Implementation
    const rootId = await findOrCreateFolder("Showrunner-AI");
    const projectId = await findOrCreateFolder(projectName, rootId);

    const folders: Record<string, string> = {};
    folders['Scripts'] = await findOrCreateFolder('Scripts', projectId);
    folders['Cast'] = await findOrCreateFolder('Cast', projectId);
    folders['Sets'] = await findOrCreateFolder('Sets', projectId);
    folders['Story'] = await findOrCreateFolder('Story', projectId);
    folders['Prod'] = await findOrCreateFolder('Prod', projectId);

    // Project DB
    let dbId = "";
    const dbQuery = `mimeType='application/vnd.google-apps.spreadsheet' and name='project_db' and '${projectId}' in parents and trashed=false`;
    const dbRes = await window.gapi.client.drive.files.list({ q: dbQuery });
    
    if (dbRes.result.files && dbRes.result.files.length > 0) {
        dbId = dbRes.result.files[0].id;
    } else {
        const sheetMeta = { properties: { title: 'project_db' } };
        const sheetRes = await window.gapi.client.sheets.spreadsheets.create({
            resource: sheetMeta,
            fields: 'spreadsheetId'
        });
        dbId = sheetRes.result.spreadsheetId;
        
        // Move to folder
        const file = await window.gapi.client.drive.files.get({ fileId: dbId, fields: 'parents' });
        const previousParents = file.result.parents.join(',');
        await window.gapi.client.drive.files.update({
            fileId: dbId,
            addParents: projectId,
            removeParents: previousParents,
            fields: 'id, parents'
        });

        // Add Headers
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: dbId,
            range: 'Sheet1!A1:F1',
            valueInputOption: 'RAW',
            resource: { values: [['ID', 'Department', 'Type', 'Title', 'Description', 'DriveLink']] }
        });
    }

    return { rootId, projectId, dbId, folders };
};

/**
 * Sync Asset Folder
 */
export const syncAssetFolder = async (asset: ProjectAsset, projectFolderId: string, folders: Record<string, string>): Promise<string> => {
    if (isMock) {
        return `mock-folder-${asset.title}`;
    }

    if (asset.driveId) return asset.driveId;

    let parentFolderId = projectFolderId;

    if (asset.department === 'Casting & Wardrobe') parentFolderId = folders['Cast'];
    else if (asset.department === 'Set Design') parentFolderId = folders['Sets'];
    else if (asset.department === 'Writers Room') parentFolderId = folders['Scripts'];
    else if (asset.department === 'Story') parentFolderId = folders['Story'];
    else if (asset.department === 'Production') parentFolderId = folders['Prod'];

    if (asset.department === 'Production' || asset.department === 'Story') {
        const folderId = await findOrCreateFolder(asset.title, parentFolderId);
        return folderId;
    }

    return parentFolderId;
};

/**
 * Upload Content
 */
export const uploadFileToDrive = async (folderId: string, filename: string, content: string | Blob, contentType: string): Promise<string> => {
    if (isMock) {
        console.log(`[Mock Drive] Uploading ${filename} to ${folderId}`);
        // Return a valid blob URL if it was a string, so the app can display it
        if (typeof content === 'string' && content.startsWith('data:')) return content;
        return "https://mock.drive.google.com/view/file-id";
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

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form,
    });
    
    const val = await res.json();
    return val.webViewLink;
};

/**
 * Update Project DB
 */
export const updateProjectDB = async (dbId: string, assets: ProjectAsset[]) => {
    if (isMock) {
        console.log(`[Mock Drive] Updating DB Sheet (${assets.length} items)`);
        return;
    }

    const rows = assets.map(a => [
        a.id, 
        a.department, 
        'Asset', 
        a.title, 
        a.description.substring(0, 100), 
        a.thumbnailUrl || ''
    ]);

    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: dbId,
        range: 'Sheet1!A2', 
        valueInputOption: 'RAW',
        resource: { values: rows }
    });
};
