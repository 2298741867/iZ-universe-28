/**
 * Google Drive REST API v3 Client
 * Uses user's OAuth access token with Google Drive scopes
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  createdTime?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  shared?: boolean;
  trashed?: boolean;
  parents?: string[];
  owners?: Array<{
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  }>;
}

export interface DriveStorageQuota {
  limit?: string; // in bytes
  usage?: string; // in bytes
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export interface DriveAboutInfo {
  user?: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
  storageQuota?: DriveStorageQuota;
}

export interface DriveBreadcrumb {
  id: string;
  name: string;
}

/**
 * Fetch storage quota and user profile details from Google Drive
 */
export async function fetchDriveAbout(accessToken: string): Promise<DriveAboutInfo> {
  const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    const errText = await response.text();
    throw new Error(`Failed to fetch Drive about information: ${errText}`);
  }

  return response.json();
}

/**
 * List files and folders inside a specific folder or root
 */
export async function listDriveFiles(
  accessToken: string,
  options: {
    folderId?: string;
    searchTerm?: string;
    mimeTypeFilter?: string;
    pageSize?: number;
    pageToken?: string;
  } = {}
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const { folderId = 'root', searchTerm = '', mimeTypeFilter, pageSize = 60, pageToken } = options;

  const queries: string[] = ['trashed = false'];

  if (searchTerm && searchTerm.trim()) {
    const escaped = searchTerm.replace(/'/g, "\\'");
    queries.push(`name contains '${escaped}'`);
  } else if (folderId) {
    queries.push(`'${folderId}' in parents`);
  }

  if (mimeTypeFilter) {
    if (mimeTypeFilter === 'folder') {
      queries.push(`mimeType = 'application/vnd.google-apps.folder'`);
    } else if (mimeTypeFilter === 'document') {
      queries.push(`(mimeType = 'application/vnd.google-apps.document' or mimeType contains 'text/' or mimeType contains 'pdf' or mimeType contains 'msword')`);
    } else if (mimeTypeFilter === 'spreadsheet') {
      queries.push(`(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType contains 'csv' or mimeType contains 'excel' or mimeType contains 'spreadsheet')`);
    } else if (mimeTypeFilter === 'media') {
      queries.push(`(mimeType contains 'image/' or mimeType contains 'video/' or mimeType contains 'audio/')`);
    } else if (mimeTypeFilter === 'telemetry') {
      queries.push(`(name contains 'antigravity' or name contains 'flight' or mimeType contains 'json')`);
    }
  }

  const q = queries.join(' and ');
  const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,iconLink,thumbnailLink,webViewLink,webContentLink,shared,parents,trashed,owners)';
  const orderBy = 'folder,modifiedTime desc,name';

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', pageSize.toString());
  url.searchParams.set('fields', fields);
  url.searchParams.set('orderBy', orderBy);
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    const errText = await response.text();
    throw new Error(`Failed to list Drive files: ${errText}`);
  }

  return response.json();
}

/**
 * Create a new folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<DriveFile> {
  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentFolderId && parentFolderId !== 'root') {
    metadata.parents = [parentFolderId];
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    const err = await response.text();
    throw new Error(`Failed to create folder: ${err}`);
  }

  return response.json();
}

/**
 * Upload a file directly to Google Drive via multipart upload
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File | Blob,
  fileName: string,
  mimeType: string,
  parentFolderId?: string
): Promise<DriveFile> {
  const metadata: Record<string, any> = {
    name: fileName,
    mimeType: mimeType || 'application/octet-stream'
  };

  if (parentFolderId && parentFolderId !== 'root') {
    metadata.parents = [parentFolderId];
  }

  const boundary = '-------AntigravityBoundary31415926535';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  // Read file data as base64 or array buffer
  const fileArrayBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(fileArrayBuffer);

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType || 'application/octet-stream'}\r\nContent-Transfer-Encoding: binary\r\n\r\n`;

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metadataPart);
  const mediaHeaderBytes = encoder.encode(mediaHeader);
  const closeBytes = encoder.encode(closeDelim);

  // Combine into single Uint8Array
  const totalLength = metaBytes.length + mediaHeaderBytes.length + fileBytes.length + closeBytes.length;
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  combined.set(metaBytes, offset);
  offset += metaBytes.length;
  combined.set(mediaHeaderBytes, offset);
  offset += mediaHeaderBytes.length;
  combined.set(fileBytes, offset);
  offset += fileBytes.length;
  combined.set(closeBytes, offset);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: combined
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    const err = await response.text();
    throw new Error(`Upload failed: ${err}`);
  }

  return response.json();
}

/**
 * Creates or uploads a text / JSON file to Drive
 */
export async function uploadTextFileToDrive(
  accessToken: string,
  content: string,
  fileName: string,
  mimeType: string = 'text/plain',
  parentFolderId?: string
): Promise<DriveFile> {
  const blob = new Blob([content], { type: mimeType });
  return uploadFileToDrive(accessToken, blob, fileName, mimeType, parentFolderId);
}

/**
 * Export Flight Telemetry & Mission Log to Google Drive
 */
export async function exportFlightTelemetryToDrive(
  accessToken: string,
  telemetry: {
    score: number;
    distance: number;
    nearMisses: number;
    shieldEnergy: number;
    speed: number;
    difficultyTier: number;
    pilotCallsign?: string;
    copilotNotes?: string;
  },
  parentFolderId?: string
): Promise<DriveFile> {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.replace(/[:.]/g, '-');
  const fileName = `antigravity_flight_telemetry_${dateStr}.json`;

  const flightReport = {
    system: 'Antigravity Flight Simulation & Telemetry System',
    version: '2.5.0-drive-sync',
    recordedAt: timestamp,
    pilot: telemetry.pilotCallsign || 'Commander',
    flightMetrics: {
      finalScore: telemetry.score,
      distanceTraveledKm: Math.round(telemetry.distance * 10) / 10,
      nearMissGravitonCouplings: telemetry.nearMisses,
      remainingShieldPercentage: Math.round(telemetry.shieldEnergy * 100),
      warpSpeedMultiplier: telemetry.speed,
      gravitationalTierReached: telemetry.difficultyTier
    },
    shipConfiguration: {
      chassis: 'AGP-1 Neon Interceptor',
      plasmaBlasterCannons: 'Active (Twin Pulsar)',
      repulsionShieldRadiusMeters: 5.0,
      gravitonInversionEngine: 'Online'
    },
    copilotAnalysis: telemetry.copilotNotes || 'Telemetry log verified by Pollux Tactical AI Assistant. No hull structural breaches detected.'
  };

  const jsonStr = JSON.stringify(flightReport, null, 2);
  return uploadTextFileToDrive(accessToken, jsonStr, fileName, 'application/json', parentFolderId);
}

/**
 * Delete a file or folder from Google Drive
 * (Note: Must be accompanied by a confirmation dialog in the UI)
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok && response.status !== 204) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    const err = await response.text();
    throw new Error(`Failed to delete file: ${err}`);
  }
}

/**
 * Rename a file or folder in Google Drive
 */
export async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<DriveFile> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    const err = await response.text();
    throw new Error(`Failed to rename file: ${err}`);
  }

  return response.json();
}

/**
 * Read text content of a file from Drive (e.g. for previewing flight logs or text notes)
 */
export async function fetchDriveFileContent(accessToken: string, fileId: string): Promise<string> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    const err = await response.text();
    throw new Error(`Failed to fetch file content: ${err}`);
  }

  return response.text();
}

/**
 * Helper to format byte counts into human-readable strings
 */
export function formatBytes(bytes?: number | string, decimals: number = 2): string {
  if (!bytes) return '0 B';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(num) / Math.log(k));
  return `${parseFloat((num / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Classify file types for iconography and badges
 */
export function getFileTypeDetails(mimeType: string, fileName: string): {
  category: 'folder' | 'document' | 'spreadsheet' | 'presentation' | 'image' | 'video' | 'audio' | 'code' | 'pdf' | 'archive' | 'file';
  label: string;
  color: string;
} {
  const nameLower = fileName.toLowerCase();

  if (mimeType === 'application/vnd.google-apps.folder') {
    return { category: 'folder', label: 'Folder', color: 'text-amber-400' };
  }
  if (mimeType === 'application/vnd.google-apps.document' || mimeType.includes('msword') || nameLower.endsWith('.doc') || nameLower.endsWith('.docx')) {
    return { category: 'document', label: 'Document', color: 'text-blue-400' };
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet' || mimeType.includes('excel') || mimeType.includes('csv') || nameLower.endsWith('.xlsx') || nameLower.endsWith('.csv')) {
    return { category: 'spreadsheet', label: 'Spreadsheet', color: 'text-emerald-400' };
  }
  if (mimeType === 'application/vnd.google-apps.presentation' || mimeType.includes('powerpoint') || nameLower.endsWith('.pptx')) {
    return { category: 'presentation', label: 'Presentation', color: 'text-orange-400' };
  }
  if (mimeType.startsWith('image/')) {
    return { category: 'image', label: 'Image', color: 'text-rose-400' };
  }
  if (mimeType.startsWith('video/')) {
    return { category: 'video', label: 'Video', color: 'text-purple-400' };
  }
  if (mimeType.startsWith('audio/')) {
    return { category: 'audio', label: 'Audio', color: 'text-pink-400' };
  }
  if (mimeType.includes('pdf') || nameLower.endsWith('.pdf')) {
    return { category: 'pdf', label: 'PDF', color: 'text-red-400' };
  }
  if (mimeType.includes('json') || nameLower.endsWith('.json') || nameLower.endsWith('.js') || nameLower.endsWith('.ts') || nameLower.endsWith('.html')) {
    return { category: 'code', label: 'Telemetry / Code', color: 'text-cyan-400' };
  }
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar') || nameLower.endsWith('.zip')) {
    return { category: 'archive', label: 'Archive', color: 'text-yellow-400' };
  }

  return { category: 'file', label: 'File', color: 'text-slate-400' };
}
