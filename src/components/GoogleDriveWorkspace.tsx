import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  signInWithGoogleDrive,
  signOutDrive,
  onDriveAuthStateChanged,
  getStoredAccessToken,
  setStoredAccessToken
} from '../services/firebase';
import {
  listDriveFiles,
  fetchDriveAbout,
  createDriveFolder,
  uploadFileToDrive,
  uploadTextFileToDrive,
  exportFlightTelemetryToDrive,
  deleteDriveFile,
  renameDriveFile,
  fetchDriveFileContent,
  formatBytes,
  getFileTypeDetails,
  DriveFile,
  DriveAboutInfo,
  DriveBreadcrumb
} from '../services/googleDrive';
import {
  HardDrive,
  Folder,
  File,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Video,
  Music,
  Download,
  Trash2,
  FolderPlus,
  Upload,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Eye,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  LogIn,
  LogOut,
  Grid,
  List,
  Sparkles,
  Rocket,
  Shield,
  FilePlus,
  Copy,
  Check,
  X
} from 'lucide-react';

interface GoogleDriveWorkspaceProps {
  currentFlightTelemetry?: {
    score: number;
    distance: number;
    nearMisses: number;
    shieldEnergy: number;
    speed: number;
    difficultyTier: number;
  };
  onSwitchToFlight?: () => void;
}

export const GoogleDriveWorkspace: React.FC<GoogleDriveWorkspaceProps> = ({
  currentFlightTelemetry = {
    score: 0,
    distance: 0,
    nearMisses: 0,
    shieldEnergy: 1.0,
    speed: 14.0,
    difficultyTier: 1
  },
  onSwitchToFlight
}) => {
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(getStoredAccessToken());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Drive state
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<DriveAboutInfo | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveBreadcrumb[]>([{ id: 'root', name: 'My Drive' }]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'folder' | 'document' | 'spreadsheet' | 'media' | 'telemetry'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFileToUpload, setSelectedFileToUpload] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);

  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('mission_debrief.txt');
  const [newNoteBody, setNewNoteBody] = useState('Antigravity Pilot Debrief:\nAll systems nominal.\nGraviton repulsion fields active.');

  const [isExportTelemetryOpen, setIsExportTelemetryOpen] = useState(false);
  const [pilotCallsign, setPilotCallsign] = useState('Commander-01');

  const [inspectingFile, setInspectingFile] = useState<DriveFile | null>(null);
  const [inspectingContent, setInspectingContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const [renamingFile, setRenamingFile] = useState<DriveFile | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deletingFile, setDeletingFile] = useState<DriveFile | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  // Subscribe to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onDriveAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccessToken(null);
      } else {
        const stored = getStoredAccessToken();
        if (stored) setAccessToken(stored);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch drive files and storage info whenever token or currentFolder changes
  const refreshDrive = useCallback(async () => {
    if (!accessToken) return;
    setLoadingFiles(true);
    setAuthError(null);

    try {
      const [filesRes, aboutRes] = await Promise.all([
        listDriveFiles(accessToken, {
          folderId: currentFolder.id,
          searchTerm: searchQuery,
          mimeTypeFilter: activeFilter === 'all' ? undefined : activeFilter
        }),
        fetchDriveAbout(accessToken).catch(() => null)
      ]);

      setFiles(filesRes.files || []);
      if (aboutRes) setAboutInfo(aboutRes);
    } catch (err: any) {
      console.error('Error refreshing Drive:', err);
      if (err.message === 'UNAUTHORIZED') {
        setAuthError('Your Google Drive session has expired. Please sign in again.');
        setAccessToken(null);
        setStoredAccessToken(null);
      } else {
        showToast(err.message || 'Failed to load Drive contents', 'error');
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [accessToken, currentFolder.id, searchQuery, activeFilter]);

  useEffect(() => {
    if (accessToken) {
      refreshDrive();
    }
  }, [accessToken, currentFolder.id, activeFilter, refreshDrive]);

  // Handle Search Debounce
  useEffect(() => {
    if (!accessToken) return;
    const timer = setTimeout(() => {
      refreshDrive();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sign In Handler
  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await signInWithGoogleDrive();
      setUser(res.user);
      setAccessToken(res.accessToken);
      showToast(`Connected to Google Drive as ${res.user.displayName || res.user.email}!`, 'success');
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setAuthError(err.message || 'Failed to authenticate with Google Drive');
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign Out Handler
  const handleSignOut = async () => {
    try {
      await signOutDrive();
      setUser(null);
      setAccessToken(null);
      setFiles([]);
      setAboutInfo(null);
      setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
      showToast('Disconnected from Google Drive', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to sign out', 'error');
    }
  };

  // Folder navigation
  const handleOpenFolder = (folder: DriveFile) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery('');
  };

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchQuery('');
  };

  // Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newFolderName.trim()) return;

    try {
      await createDriveFolder(accessToken, newFolderName.trim(), currentFolder.id);
      showToast(`Created folder "${newFolderName}"`, 'success');
      setNewFolderName('');
      setIsNewFolderOpen(false);
      refreshDrive();
    } catch (err: any) {
      showToast(err.message || 'Failed to create folder', 'error');
    }
  };

  // Upload File
  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedFileToUpload) return;

    setUploadProgress(true);
    try {
      await uploadFileToDrive(
        accessToken,
        selectedFileToUpload,
        selectedFileToUpload.name,
        selectedFileToUpload.type,
        currentFolder.id
      );
      showToast(`Uploaded "${selectedFileToUpload.name}" to Google Drive`, 'success');
      setSelectedFileToUpload(null);
      setIsUploadOpen(false);
      refreshDrive();
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadProgress(false);
    }
  };

  // Create Note
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newNoteTitle.trim()) return;

    try {
      await uploadTextFileToDrive(
        accessToken,
        newNoteBody,
        newNoteTitle.trim(),
        'text/plain',
        currentFolder.id
      );
      showToast(`Created note "${newNoteTitle}"`, 'success');
      setIsNewNoteOpen(false);
      refreshDrive();
    } catch (err: any) {
      showToast(err.message || 'Failed to create note', 'error');
    }
  };

  // Export Flight Telemetry
  const handleExportTelemetry = async () => {
    if (!accessToken) return;

    try {
      const result = await exportFlightTelemetryToDrive(
        accessToken,
        {
          ...currentFlightTelemetry,
          pilotCallsign
        },
        currentFolder.id
      );
      showToast(`Saved flight telemetry log "${result.name}" to Google Drive!`, 'success');
      setIsExportTelemetryOpen(false);
      refreshDrive();
    } catch (err: any) {
      showToast(err.message || 'Failed to export telemetry', 'error');
    }
  };

  // Inspect File Content
  const handleInspectFile = async (file: DriveFile) => {
    setInspectingFile(file);
    setInspectingContent(null);
    setCopiedContent(false);

    // If text/json/markdown/code, fetch content
    const isTextLike =
      file.mimeType.includes('text') ||
      file.mimeType.includes('json') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.csv');

    if (isTextLike && accessToken) {
      setLoadingContent(true);
      try {
        const text = await fetchDriveFileContent(accessToken, file.id);
        setInspectingContent(text);
      } catch (err) {
        setInspectingContent('Unable to preview raw text content.');
      } finally {
        setLoadingContent(false);
      }
    }
  };

  // Rename File
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !renamingFile || !renameValue.trim()) return;

    try {
      await renameDriveFile(accessToken, renamingFile.id, renameValue.trim());
      showToast(`Renamed to "${renameValue.trim()}"`, 'success');
      setRenamingFile(null);
      refreshDrive();
    } catch (err: any) {
      showToast(err.message || 'Failed to rename file', 'error');
    }
  };

  // Delete File
  const handleDeleteConfirm = async () => {
    if (!accessToken || !deletingFile) return;

    try {
      await deleteDriveFile(accessToken, deletingFile.id);
      showToast(`Deleted "${deletingFile.name}"`, 'success');
      setDeletingFile(null);
      refreshDrive();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete file', 'error');
    }
  };

  // Storage quota calculations
  const quotaStats = useMemo(() => {
    if (!aboutInfo?.storageQuota) return null;
    const limit = aboutInfo.storageQuota.limit ? parseInt(aboutInfo.storageQuota.limit, 10) : 0;
    const usage = aboutInfo.storageQuota.usage ? parseInt(aboutInfo.storageQuota.usage, 10) : 0;
    const pct = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;
    return {
      limitStr: limit > 0 ? formatBytes(limit) : 'Unlimited',
      usageStr: formatBytes(usage),
      percentage: pct
    };
  }, [aboutInfo]);

  // Helper for rendering file icons
  const renderFileIcon = (file: DriveFile, sizeClass: string = 'w-6 h-6') => {
    const details = getFileTypeDetails(file.mimeType, file.name);
    switch (details.category) {
      case 'folder':
        return <Folder className={`${sizeClass} text-amber-400 fill-amber-400/20`} />;
      case 'document':
        return <FileText className={`${sizeClass} text-sky-400`} />;
      case 'spreadsheet':
        return <FileSpreadsheet className={`${sizeClass} text-emerald-400`} />;
      case 'presentation':
        return <FileText className={`${sizeClass} text-orange-400`} />;
      case 'image':
        return <ImageIcon className={`${sizeClass} text-rose-400`} />;
      case 'video':
        return <Video className={`${sizeClass} text-purple-400`} />;
      case 'audio':
        return <Music className={`${sizeClass} text-pink-400`} />;
      case 'code':
        return <FileCode className={`${sizeClass} text-cyan-400`} />;
      default:
        return <File className={`${sizeClass} text-slate-400`} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
          {toastMessage.type === 'info' && <Sparkles className="w-4 h-4 text-cyan-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Workspace Hero Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-cyan-400 p-0.5 shadow-lg shadow-sky-500/20 shrink-0 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <HardDrive className="w-7 h-7 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-extrabold tracking-tight text-white font-display">
                  Google Drive App
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Google Workspace
                </span>
                {accessToken && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active OAuth Session" />
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1 max-w-xl">
                Browse, search, upload, organize, and sync files with your real Google Drive account.
                Export flight telemetry logs and game runs directly to your cloud storage.
              </p>
            </div>
          </div>

          {/* User Auth Bar */}
          <div className="flex items-center gap-3">
            {!accessToken ? (
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'Connecting to Google...' : 'Connect Google Drive'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-slate-950/70 border border-slate-800 p-2 rounded-xl">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google User'}
                    className="w-9 h-9 rounded-lg object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-300 flex items-center justify-center font-bold text-xs">
                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'G'}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-white truncate max-w-[140px]">
                    {user?.displayName || 'Google Pilot'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                    {user?.email || 'drive-synced'}
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Disconnect Google Drive"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Auth Error Banner if needed */}
        {authError && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{authError}</span>
            </div>
            <button
              onClick={handleSignIn}
              className="px-3 py-1 rounded-lg bg-rose-500 text-slate-950 font-bold hover:bg-rose-400 transition-colors cursor-pointer"
            >
              Sign In Again
            </button>
          </div>
        )}

        {/* Drive Storage Quota Indicator */}
        {accessToken && quotaStats && (
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 max-w-md space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">Google Drive Storage</span>
                <span className="font-mono text-cyan-400">
                  {quotaStats.usageStr} of {quotaStats.limitStr} ({quotaStats.percentage}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-500"
                  style={{ width: `${Math.max(2, quotaStats.percentage)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Live Quota Sync</span>
              <span className="text-slate-600">·</span>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
              >
                <span>drive.google.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Main Drive Workspace Body */}
      {!accessToken ? (
        /* Logged Out / Call to Action */
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-cyan-400 shadow-inner">
            <Lock className="w-10 h-10" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-xl font-bold text-white font-display">
              Access Google Drive Workspace
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect your Google account to explore and manage your files directly inside Antigravity.
              You will be able to upload documents, create folders, and sync mission flight telemetry.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={handleSignIn}
              disabled={authLoading}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-xl shadow-indigo-500/25 inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{authLoading ? 'Connecting...' : 'Sign in with Google Drive'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Logged In: Full Drive Explorer App */
        <div className="space-y-4">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsNewFolderOpen(true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>New Folder</span>
              </button>

              <button
                onClick={() => setIsUploadOpen(true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Upload File</span>
              </button>

              <button
                onClick={() => setIsNewNoteOpen(true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>New Note</span>
              </button>

              <button
                onClick={() => setIsExportTelemetryOpen(true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-cyan-950"
              >
                <Rocket className="w-3.5 h-3.5 text-cyan-400" />
                <span>Save Flight Log to Drive</span>
              </button>
            </div>

            {/* Refresh and View Switcher */}
            <div className="flex items-center gap-2">
              <button
                onClick={refreshDrive}
                disabled={loadingFiles}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh Drive files"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                    viewMode === 'grid' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                    viewMode === 'list' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Path Breadcrumbs & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 rounded-xl px-4 py-2.5">
            {/* Breadcrumb Navigation */}
            <nav className="flex items-center gap-1.5 text-xs overflow-x-auto py-1">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                    <button
                      onClick={() => handleBreadcrumbClick(idx)}
                      className={`px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ${
                        isLast ? 'text-white font-bold bg-slate-800/60' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>

            {/* Instant Search Bar */}
            <div className="relative min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in Google Drive..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 text-xs">
            <span className="text-slate-500 text-[11px] font-medium mr-1">Filter:</span>
            {(
              [
                { id: 'all', label: 'All Files' },
                { id: 'folder', label: 'Folders Only' },
                { id: 'document', label: 'Documents' },
                { id: 'spreadsheet', label: 'Sheets' },
                { id: 'media', label: 'Media' },
                { id: 'telemetry', label: 'Flight Logs (.json)' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeFilter === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Files Display: Loading / Empty / Grid / List */}
          {loadingFiles ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <div className="text-xs text-slate-400">Loading Google Drive files...</div>
            </div>
          ) : files.length === 0 ? (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl py-16 text-center space-y-4">
              <Folder className="w-12 h-12 text-slate-600 mx-auto" />
              <div className="max-w-sm mx-auto space-y-1">
                <div className="text-sm font-semibold text-slate-300">
                  {searchQuery ? `No files matching "${searchQuery}"` : 'This folder is empty'}
                </div>
                <p className="text-xs text-slate-500">
                  {searchQuery
                    ? 'Try searching with different keywords or clear the filter.'
                    : 'Upload a file or export your Antigravity flight log to start.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload File</span>
                </button>
                <button
                  onClick={() => setIsExportTelemetryOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-950 border border-cyan-600 text-cyan-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>Save Flight Log</span>
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {files.map((file) => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const fileType = getFileTypeDetails(file.mimeType, file.name);

                return (
                  <div
                    key={file.id}
                    onDoubleClick={() => (isFolder ? handleOpenFolder(file) : handleInspectFile(file))}
                    className="group relative bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer"
                  >
                    <div>
                      {/* Top icon and hover action dropdown */}
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <div
                          onClick={() => (isFolder ? handleOpenFolder(file) : handleInspectFile(file))}
                          className="p-2 rounded-lg bg-slate-950/60"
                        >
                          {renderFileIcon(file, 'w-6 h-6')}
                        </div>

                        {/* Quick Action Buttons on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 rounded bg-slate-800 hover:bg-cyan-950 text-slate-400 hover:text-cyan-400 transition-colors"
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingFile(file);
                              setRenameValue(file.name);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Rename"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingFile(file);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* File Name */}
                      <div
                        onClick={() => (isFolder ? handleOpenFolder(file) : handleInspectFile(file))}
                        className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors line-clamp-2 break-all"
                        title={file.name}
                      >
                        {file.name}
                      </div>
                    </div>

                    {/* File Meta footer */}
                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{isFolder ? 'Folder' : formatBytes(file.size)}</span>
                      <span>
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Size</th>
                      <th className="px-5 py-3">Last Modified</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {files.map((file) => {
                      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                      const details = getFileTypeDetails(file.mimeType, file.name);

                      return (
                        <tr
                          key={file.id}
                          className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                          onClick={() => (isFolder ? handleOpenFolder(file) : handleInspectFile(file))}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              {renderFileIcon(file, 'w-4 h-4')}
                              <span className="font-medium text-white group-hover:text-cyan-300 transition-colors truncate max-w-xs md:max-w-md">
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400">
                            <span className={`text-[11px] font-medium ${details.color}`}>
                              {details.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 font-mono-num text-[11px]">
                            {isFolder ? '—' : formatBytes(file.size)}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 text-[11px]">
                            {file.modifiedTime
                              ? new Date(file.modifiedTime).toLocaleString(undefined, {
                                  dateStyle: 'short',
                                  timeStyle: 'short'
                                })
                              : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleInspectFile(file)}
                                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Inspect details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {file.webViewLink && (
                                <a
                                  href={file.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
                                  title="Open in Drive"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setRenamingFile(file);
                                  setRenameValue(file.name);
                                }}
                                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Rename"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingFile(file)}
                                className="p-1.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Create Folder */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">New Folder</h3>
              </div>
              <button
                onClick={() => setIsNewFolderOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Folder Name</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Antigravity Mission Logs"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Upload File */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-white text-base">Upload File to Google Drive</h3>
              </div>
              <button
                onClick={() => setIsUploadOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadFile} className="space-y-4">
              <div className="text-xs text-slate-400">
                Uploading to: <span className="font-bold text-slate-200">{currentFolder.name}</span>
              </div>

              <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-sky-500/50 transition-colors bg-slate-950/50">
                <input
                  type="file"
                  id="file-upload-input"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFileToUpload(e.target.files[0]);
                    }
                  }}
                />
                <label htmlFor="file-upload-input" className="cursor-pointer block space-y-2">
                  <Upload className="w-8 h-8 text-sky-400 mx-auto" />
                  {selectedFileToUpload ? (
                    <div>
                      <div className="text-xs font-semibold text-white">{selectedFileToUpload.name}</div>
                      <div className="text-[11px] text-slate-400">{formatBytes(selectedFileToUpload.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs font-semibold text-sky-400">Click to choose a file</div>
                      <div className="text-[11px] text-slate-500">Supports documents, images, flight logs, or code</div>
                    </div>
                  )}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFileToUpload || uploadProgress}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploadProgress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{uploadProgress ? 'Uploading...' : 'Upload to Drive'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: New Note / Document */}
      {isNewNoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">New Note / File</h3>
              </div>
              <button
                onClick={() => setIsNewNoteOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">File Name</label>
                <input
                  type="text"
                  required
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="flight_notes.txt"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Note Content</label>
                <textarea
                  rows={6}
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  placeholder="Enter text contents to save to Google Drive..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white font-mono focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewNoteOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newNoteTitle.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save to Google Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Export Flight Telemetry Log */}
      {isExportTelemetryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base font-display">Export Flight Log to Drive</h3>
              </div>
              <button
                onClick={() => setIsExportTelemetryOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400">
              Save your AGP-1 flight metrics and graviton near-miss telemetry into Google Drive as a structured JSON mission log.
            </div>

            {/* Current Flight Metrics Summary Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 text-[11px] block">Flight Score</span>
                <span className="font-bold text-cyan-400 text-base">{currentFlightTelemetry.score}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Distance Traveled</span>
                <span className="font-bold text-white text-base">
                  {Math.round(currentFlightTelemetry.distance * 10) / 10} km
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Near-Miss Couplings</span>
                <span className="font-bold text-amber-400">{currentFlightTelemetry.nearMisses}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Shield Energy</span>
                <span className="font-bold text-emerald-400">
                  {Math.round(currentFlightTelemetry.shieldEnergy * 100)}%
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Pilot Callsign</label>
              <input
                type="text"
                value={pilotCallsign}
                onChange={(e) => setPilotCallsign(e.target.value)}
                placeholder="Commander-01"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {onSwitchToFlight && (
                <button
                  type="button"
                  onClick={() => {
                    setIsExportTelemetryOpen(false);
                    onSwitchToFlight();
                  }}
                  className="text-xs text-cyan-400 hover:underline cursor-pointer"
                >
                  Return to Flight Simulator
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsExportTelemetryOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExportTelemetry}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>Save to Google Drive</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: File Detail / Content Inspector */}
      {inspectingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                  {renderFileIcon(inspectingFile, 'w-6 h-6')}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm line-clamp-1 break-all">{inspectingFile.name}</h3>
                  <div className="text-[11px] text-slate-400">
                    {getFileTypeDetails(inspectingFile.mimeType, inspectingFile.name).label} · {formatBytes(inspectingFile.size)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectingFile(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata Badges */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs text-slate-400 shrink-0">
              <div>
                <span className="text-slate-500 text-[10px] block">Modified</span>
                <span className="text-slate-200">
                  {inspectingFile.modifiedTime ? new Date(inspectingFile.modifiedTime).toLocaleString() : 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">File ID</span>
                <span className="text-slate-200 font-mono text-[10px] truncate block">{inspectingFile.id}</span>
              </div>
            </div>

            {/* Content Preview Box if available */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-[140px]">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-semibold text-slate-300">File Content Preview</span>
                {inspectingContent && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inspectingContent);
                      setCopiedContent(true);
                      setTimeout(() => setCopiedContent(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {copiedContent ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedContent ? 'Copied!' : 'Copy Text'}</span>
                  </button>
                )}
              </div>
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                {loadingContent ? (
                  <div className="py-6 text-center text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Loading content from Google Drive...</span>
                  </div>
                ) : inspectingContent !== null ? (
                  inspectingContent
                ) : (
                  <div className="py-6 text-center text-slate-500">
                    Preview not available for this MIME type. Use the button below to open in Google Drive.
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 shrink-0">
              {inspectingFile.webViewLink && (
                <a
                  href={inspectingFile.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Google Drive</span>
                </a>
              )}
              <button
                onClick={() => setInspectingFile(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors ml-auto cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Rename File */}
      {renamingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Rename</h3>
              </div>
              <button
                onClick={() => setRenamingFile(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">New Name</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingFile(null)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameValue.trim() || renameValue === renamingFile.name}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: Strict Delete Confirmation Dialog */}
      {deletingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Delete from Drive?</h3>
                <div className="text-[11px] text-rose-300">This action will remove the item from your Drive.</div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
              <div className="text-slate-400 text-[11px]">Item to delete:</div>
              <div className="font-bold text-white break-all">{deletingFile.name}</div>
              <div className="text-[10px] text-slate-500">
                {getFileTypeDetails(deletingFile.mimeType, deletingFile.name).label} · {formatBytes(deletingFile.size)}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingFile(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-rose-950"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
