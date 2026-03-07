
import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Staff, TrainingSession, ViewMode, Signature, CloudConfig, SessionType } from './types';
import * as Storage from './services/storageService';
import * as CloudService from './services/cloudService';
import { SyncService } from './services/syncService';
import SignaturePad from './components/SignaturePad';
import PrintReport from './components/PrintReport';
import CloudSetup from './components/CloudSetup';

// Declare XLSX global from the CDN script
declare var XLSX: any;

// Simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);

interface DeleteConfirmInfo {
    staffId: string;
    staffName: string;
    targetSessionId: string;
    relatedSessionIds: string[];
    targetDate: string;
}

const App: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('landing');
    const [sessions, setSessions] = useState<TrainingSession[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

    // App Initialization State
    const [isInitializing, setIsInitializing] = useState(true);
    const [isLinkAccess, setIsLinkAccess] = useState(false);

    // Cloud Config
    const [cloudConfig, setCloudConfig] = useState<CloudConfig>({ enabled: false, scriptUrl: '' });
    const [isLoading, setIsLoading] = useState(false);

    // Admin Create State
    const [newSessionType, setNewSessionType] = useState<SessionType>('school');
    const [newTitle, setNewTitle] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [newSchool, setNewSchool] = useState(() => localStorage.getItem('training_app_last_school') || '');
    const [enableAuth, setEnableAuth] = useState(false);
    const [newAuthCode, setNewAuthCode] = useState('');

    const [shareModalSession, setShareModalSession] = useState<TrainingSession | null>(null);

    // Delete Modal State
    const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<DeleteConfirmInfo | null>(null);

    // App Base URL State
    const [appBaseUrl, setAppBaseUrl] = useState('');

    // Staff Management State
    const [globalStaffList, setGlobalStaffList] = useState<Staff[]>([]);

    // Signer State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

    // Office Mode Signer State
    const [manualInput, setManualInput] = useState({
        department: '',
        position: '',
        name: ''
    });

    // Auth & Signing Flow State
    const [pendingStaff, setPendingStaff] = useState<Staff | null>(null);
    const [isSigning, setIsSigning] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authInput, setAuthInput] = useState('');
    const [authError, setAuthError] = useState(false);
    const [isSessionAuthenticated, setIsSessionAuthenticated] = useState(false);

    useEffect(() => {
        setIsSessionAuthenticated(false);
    }, [selectedSessionId]);

    // Notification
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

    // Hidden file input for session staff update
    const sessionFileInputRef = useRef<HTMLInputElement>(null);
    const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);

    const APP_VERSION = "v1.9.2";

    useEffect(() => {
        const initApp = async () => {
            resetBaseUrl();
            setGlobalStaffList(Storage.getStaffList());

            const params = new URLSearchParams(window.location.search);
            const urlSessionId = params.get('sessionId');
            const urlEndpoint = params.get('endpoint');

            if (urlSessionId) {
                setIsLinkAccess(true);
                setViewMode('signer');
                setSelectedSessionId(urlSessionId);

                if (urlEndpoint) {
                    const decodedUrl = decodeURIComponent(urlEndpoint);
                    const newCloud = { enabled: true, scriptUrl: decodedUrl };
                    setCloudConfig(newCloud);
                    await loadSessions(true, decodedUrl);
                } else {
                    const savedCloud = localStorage.getItem('training_app_cloud_config');
                    if (savedCloud) {
                        const parsed = JSON.parse(savedCloud);
                        setCloudConfig(parsed);
                        await loadSessions(parsed.enabled, parsed.scriptUrl);
                    } else {
                        await loadSessions(false);
                    }
                }
            } else {
                setIsLinkAccess(false);
                const savedCloud = localStorage.getItem('training_app_cloud_config');
                if (savedCloud) {
                    const parsed = JSON.parse(savedCloud);
                    setCloudConfig(parsed);
                    await loadSessions(parsed.enabled, parsed.scriptUrl);
                } else {
                    await loadSessions(false);
                }
            }

            setIsInitializing(false);

            // Auto-sync attempt if Client ID exists (with delay for library load)
            if (SyncService.getClientId()) {
                setTimeout(() => handleGoogleSync(true), 2000);
            }
        };

        initApp();
    }, []);

    useEffect(() => {
        const defaultTitle = '교직원 연수 등록부';
        if (selectedSessionId && sessions.length > 0) {
            const session = sessions.find(s => s.id === selectedSessionId);
            if (session) {
                document.title = session.title;
                return;
            }
        }
        document.title = defaultTitle;
    }, [selectedSessionId, sessions]);

    const resetBaseUrl = () => {
        let currentUrl = window.location.href.split('?')[0];
        if (currentUrl.startsWith('blob:')) currentUrl = currentUrl.replace('blob:', '');
        if (currentUrl.endsWith('/')) currentUrl = currentUrl.slice(0, -1);
        setAppBaseUrl(currentUrl);
    };

    const showNotification = (msg: string, type: 'success' | 'error') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const loadSessions = async (isCloud: boolean, url?: string) => {
        setIsLoading(true);
        try {
            if (isCloud && url) {
                const data = await CloudService.fetchCloudSessions(url);
                setSessions(data);
                return data;
            } else {
                const data = Storage.getSessions();
                setSessions(data);
                return data;
            }
        } catch (e: any) {
            console.error(e);
            const msg = e.message && e.message.includes('스크립트') ? e.message : '데이터 불러오기 실패.';
            showNotification(msg, 'error');
            return [];
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloudSetupSave = (url: string) => {
        const newConfig = { enabled: true, scriptUrl: url };
        setCloudConfig(newConfig);
        localStorage.setItem('training_app_cloud_config', JSON.stringify(newConfig));
        setViewMode('admin');
        showNotification('구글 드라이브 연동 완료.', 'success');
        loadSessions(true, url);

        // Auto-save to Google Drive if possible
        if (SyncService.getClientId()) {
            SyncService.saveConfigToDrive({
                scriptUrl: url,
                lastSyncedAt: Date.now()
            }).then(success => {
                if (success) console.log("Config backed up to Google Drive");
            });
        }
    };

    const handleGoogleSync = async (isAuto = false) => {
        const clientId = SyncService.getClientId();
        if (!clientId) {
            if (isAuto) return;
            const input = prompt("Google Cloud Console에서 발급받은 Client ID를 입력해주세요:");
            if (input) {
                SyncService.setClientId(input);
            } else {
                return;
            }
        }

        setIsLoading(true);
        try {
            await SyncService.login();
            const config = await SyncService.loadConfigFromDrive();
            if (config && config.scriptUrl) {
                const newConfig = { enabled: true, scriptUrl: config.scriptUrl };
                setCloudConfig(newConfig);
                localStorage.setItem('training_app_cloud_config', JSON.stringify(newConfig));
                await loadSessions(true, config.scriptUrl);
                showNotification('구글 계정에서 설정을 불러왔습니다.', 'success');
            } else if (!isAuto) {
                // If no config on drive but we have local config, upload it
                if (cloudConfig.enabled && cloudConfig.scriptUrl) {
                    const success = await SyncService.saveConfigToDrive({
                        scriptUrl: cloudConfig.scriptUrl,
                        lastSyncedAt: Date.now()
                    });
                    if (success) showNotification('현재 설정을 구글 드라이브에 백업했습니다.', 'success');
                } else {
                    showNotification('구글 드라이브에 저장된 설정이 없습니다.', 'error');
                }
            }
        } catch (e: any) {
            console.error(e);
            if (!isAuto) showNotification('동기화 실패: ' + (e.message || '알 수 없는 오류'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle || !newDate || !newSchool) {
            showNotification('필수 정보를 입력해주세요.', 'error');
            return;
        }
        if (newSessionType === 'school' && globalStaffList.length === 0) {
            showNotification('등록된 교직원 명단이 없습니다.', 'error');
            return;
        }

        const newSession: TrainingSession = {
            id: generateId(),
            type: newSessionType,
            title: newTitle,
            date: newDate,
            time: newTime || undefined,
            schoolName: newSchool,
            maxParticipants: newSessionType === 'school' ? 200 : 500,
            authCode: enableAuth ? newAuthCode : undefined,
            staffList: newSessionType === 'school' ? [...globalStaffList] : [],
            signatures: [],
            createdAt: Date.now()
        };

        if (cloudConfig.enabled) {
            setIsLoading(true);
            const success = await CloudService.createCloudSession(cloudConfig.scriptUrl, newSession);
            setIsLoading(false);
            if (success) {
                showNotification('연수가 구글 드라이브에 저장되었습니다.', 'success');
                loadSessions(true, cloudConfig.scriptUrl);
                localStorage.setItem('training_app_last_school', newSchool);
            }
        } else {
            Storage.saveSession(newSession);
            loadSessions(false);
            localStorage.setItem('training_app_last_school', newSchool);
            showNotification('연수가 로컬에 저장되었습니다.', 'success');
        }

        setNewTitle('');
        setNewDate('');
        setNewTime('');
        setEnableAuth(false);
        setNewAuthCode('');
    };

    const handleDeleteSession = async (id: string) => {
        if (confirm('이 연수를 삭제하시겠습니까? 서명 데이터도 모두 삭제됩니다.')) {
            if (cloudConfig.enabled) {
                setIsLoading(true);
                const success = await CloudService.deleteCloudSession(cloudConfig.scriptUrl, id);
                if (success) {
                    await loadSessions(true, cloudConfig.scriptUrl);
                    showNotification('연수가 삭제되었습니다.', 'success');
                }
                setIsLoading(false);
            } else {
                Storage.deleteSession(id);
                loadSessions(false);
                showNotification('연수가 삭제되었습니다.', 'success');
            }
        }
    };

    const parseStaffFromFile = async (file: File): Promise<Staff[]> => {
        let parsedStaff: Staff[] = [];
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'xlsx' || extension === 'xls') {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            if (jsonData.length === 0) return [];

            let nameCol = -1, jobCol = -1;
            for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                jsonData[i].forEach((cell: any, idx: number) => {
                    if (typeof cell === 'string') {
                        if (cell.includes('성명') || cell.includes('이름')) nameCol = idx;
                        if (cell.includes('직위') || cell.includes('직급')) jobCol = idx;
                    }
                });
                if (nameCol !== -1) break;
            }

            const startRow = nameCol !== -1 ? 1 : 0;
            for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i];
                const name = nameCol !== -1 ? row[nameCol] : row[1];
                const dept = jobCol !== -1 ? row[jobCol] : (row[0] || '교직원');
                if (name && String(name).trim()) {
                    parsedStaff.push({ id: generateId(), department: String(dept).trim(), name: String(name).trim() });
                }
            }
        } else {
            const text = await file.text();
            text.split('\n').forEach(line => {
                const parts = line.trim().split(/[,\t]/);
                if (parts.length >= 2) parsedStaff.push({ id: generateId(), department: parts[0].trim(), name: parts[1].trim() });
                else if (parts[0].trim()) parsedStaff.push({ id: generateId(), department: '교직원', name: parts[0].trim() });
            });
        }
        return parsedStaff;
    };

    const handleGlobalStaffUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const parsed = await parseStaffFromFile(file);
            if (parsed.length > 0) {
                Storage.saveStaffList(parsed);
                setGlobalStaffList(parsed);
                showNotification(`기본 명단 ${parsed.length}명이 등록되었습니다.`, 'success');
            }
        } catch (err) {
            showNotification('파일 읽기 오류', 'error');
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const handleResetStaffList = () => {
        if (confirm('모든 교직원 명단을 삭제하시겠습니까? (이미 등록된 연수의 명단은 영향을 받지 않습니다)')) {
            Storage.saveStaffList([]);
            setGlobalStaffList([]);
            showNotification('교직원 명단이 초기화되었습니다.', 'success');
        }
    };

    const openSessionStaffUpdate = (sessionId: string) => {
        setUpdatingSessionId(sessionId);
        sessionFileInputRef.current?.click();
    };

    const handleSessionStaffUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const sessionId = updatingSessionId;
        if (!file || !sessionId) return;

        setIsLoading(true);
        try {
            const newStaff = await parseStaffFromFile(file);
            if (newStaff.length === 0) throw new Error("유효한 명단이 없습니다.");

            const session = sessions.find(s => s.id === selectedSessionId);
            if (!session) return;

            const signedStaffIds = new Set(session.signatures.map(sig => sig.staffId));
            const updatedStaffList: Staff[] = [];

            newStaff.forEach(ns => {
                const existing = session.staffList.find(os => os.name === ns.name && os.department === ns.department);
                if (existing) {
                    updatedStaffList.push(existing);
                } else {
                    updatedStaffList.push(ns);
                }
            });

            session.staffList.forEach(os => {
                if (signedStaffIds.has(os.id)) {
                    const alreadyAdded = updatedStaffList.some(ns => ns.id === os.id);
                    if (!alreadyAdded) updatedStaffList.push(os);
                }
            });

            const updatedSession = { ...session, staffList: updatedStaffList };

            if (cloudConfig.enabled) {
                const success = await CloudService.createCloudSession(cloudConfig.scriptUrl, updatedSession);
                if (success) {
                    showNotification('연수 명단이 업데이트되었습니다.', 'success');
                    await loadSessions(true, cloudConfig.scriptUrl);
                }
            } else {
                Storage.saveSession(updatedSession);
                loadSessions(false);
                showNotification('연수 명단이 업데이트되었습니다.', 'success');
            }
        } catch (err: any) {
            showNotification(err.message || '업데이트 실패', 'error');
        } finally {
            setIsLoading(false);
            setUpdatingSessionId(null);
            e.target.value = '';
        }
    };

    const handleSchoolStaffSelect = (staff: Staff) => {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (!session) return;
        if (session.signatures.some(sig => sig.staffId === staff.id)) {
            if (!confirm('이미 서명하셨습니다. 다시 서명하시겠습니까?')) return;
        }
        setSelectedStaff(staff);
        setIsSigning(true);
    };

    const handleOfficeInfoSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualInput.department || !manualInput.position || !manualInput.name) {
            showNotification('정보를 입력해주세요.', 'error');
            return;
        }
        const displayStaff: Staff = {
            id: generateId(),
            name: manualInput.name,
            department: manualInput.position,
            affiliation: manualInput.department
        };
        setSelectedStaff(displayStaff);
        setIsSigning(true);
    };

    const handleAuthSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session && session.authCode === authInput) {
            setIsAuthModalOpen(false);
            if (pendingStaff) {
                setSelectedStaff(pendingStaff);
                setPendingStaff(null);
                setIsSigning(true);
            } else {
                setIsSessionAuthenticated(true);
            }
            setAuthInput('');
            setAuthError(false);
        } else {
            setAuthError(true);
            setAuthInput('');
        }
    };

    const handleSignatureSave = async (dataUrl: string) => {
        if (!selectedSessionId || !selectedStaff) return;
        const currentSession = sessions.find(s => s.id === selectedSessionId);
        if (!currentSession) return;

        const signature: Signature = {
            staffId: selectedStaff.id,
            staffName: selectedStaff.name,
            department: selectedStaff.department,
            affiliation: selectedStaff.affiliation,
            signatureData: dataUrl,
            timestamp: Date.now()
        };

        const targetDate = currentSession.date;
        const targetSessions = sessions.filter(s => s.date === targetDate && s.type === currentSession.type);
        const targetSessionIds = targetSessions.map(s => s.id);

        setIsLoading(true);
        if (cloudConfig.enabled) {
            const success = await CloudService.addSignatureBatch(cloudConfig.scriptUrl, targetSessionIds, signature);
            if (success) {
                showNotification(`${selectedStaff.name}님 서명 전송 완료.`, 'success');
                await loadSessions(true, cloudConfig.scriptUrl);
            }
        } else {
            targetSessionIds.forEach(id => Storage.addSignatureToSession(id, signature));
            showNotification(`${selectedStaff.name}님 서명 완료.`, 'success');
            loadSessions(false);
        }
        setIsLoading(false);
        setIsSigning(false);
        setSelectedStaff(null);
        setSearchTerm('');
        setManualInput({ department: '', position: '', name: '' });
    };

    const handleSignatureDelete = async (staffId: string) => {
        const currentSession = sessions.find(s => s.id === selectedSessionId);
        if (!currentSession) return;
        const staffName = currentSession.signatures.find(s => s.staffId === staffId)?.staffName || '사용자';
        const sameDateSessions = sessions.filter(s => s.date === currentSession.date && s.type === currentSession.type);
        setDeleteConfirmInfo({
            staffId, staffName,
            targetSessionId: currentSession.id,
            relatedSessionIds: sameDateSessions.map(s => s.id),
            targetDate: currentSession.date
        });
    };

    const executeDelete = async (scope: 'all' | 'single') => {
        if (!deleteConfirmInfo) return;
        setIsLoading(true);
        const { staffId, targetSessionId, relatedSessionIds } = deleteConfirmInfo;
        const deleteTargets = scope === 'all' ? relatedSessionIds : [targetSessionId];

        if (cloudConfig.enabled) {
            await CloudService.removeSignatureBatch(cloudConfig.scriptUrl, deleteTargets, staffId);
            await loadSessions(true, cloudConfig.scriptUrl);
        } else {
            deleteTargets.forEach(sid => Storage.removeSignatureFromSession(sid, staffId));
            loadSessions(false);
        }
        setIsLoading(false);
        setDeleteConfirmInfo(null);
        showNotification('서명이 삭제되었습니다.', 'success');
    };

    const getShareUrl = (sessionId: string) => {
        const baseUrl = appBaseUrl || window.location.href.split('?')[0];
        if (cloudConfig.enabled) return `${baseUrl}?sessionId=${sessionId}&endpoint=${encodeURIComponent(cloudConfig.scriptUrl)}`;
        return `${baseUrl}?sessionId=${sessionId}`;
    };

    const getTargetSessionTitles = () => {
        if (!selectedSessionId) return [];
        const current = sessions.find(s => s.id === selectedSessionId);
        if (!current) return [];
        return sessions.filter(s => s.date === current.date && s.type === current.type).map(s => s.title);
    };

    const renderNotification = () => notification && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] px-6 py-3 rounded-full shadow-lg text-white font-medium animate-fade-in-down ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {notification.msg}
        </div>
    );

    const renderGlobalLoading = () => isLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center z-[150] animate-fade-in">
            <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-4 shadow-xl"></div>
            <div className="bg-white/10 px-6 py-2 rounded-full border border-white/20">
                <p className="text-white font-bold text-lg tracking-wider animate-pulse">데이터 반영 중...</p>
            </div>
        </div>
    );

    const renderLanding = () => (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600 p-4">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-8 relative overflow-hidden">
                <div className="absolute top-5 right-6 bg-blue-50 text-blue-500 text-[10px] px-2 py-0.5 rounded border border-blue-100 font-bold z-10">
                    {APP_VERSION}
                </div>

                <div className="space-y-2 pt-4">
                    <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight leading-tight">
                        교직원 연수 등록부<br />
                        <span className="text-blue-600">서명 도우미</span>
                    </h1>
                </div>

                <div className="space-y-1">
                    <p className="text-gray-700 font-bold text-lg">만든이 : 곤쌤</p>
                    <p className="text-gray-400 text-xs leading-relaxed">
                        프로그램 관련 문의사항은 <br />
                        <a href="https://open.kakao.com/o/scEWSgwf" target="_blank" className="text-blue-400 underline font-bold">오픈카톡방</a>으로 문의주세요.
                    </p>
                </div>

                <div className="space-y-4">
                    <button onClick={() => setViewMode('signer')} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-blue-700 active:scale-95 transition-all">서명하기 (교직원용)</button>
                    <button onClick={() => setViewMode('admin')} className="w-full py-5 bg-white border-2 border-gray-100 text-gray-600 rounded-2xl font-bold text-xl shadow-sm hover:bg-gray-50 active:scale-95 transition-all">관리자 모드</button>

                    <button
                        onClick={() => handleGoogleSync()}
                        className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-sm border border-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032 s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2 C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                        </svg>
                        구글 계정 동기화 (다른 컴퓨터에서 불러오기)
                    </button>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <span className={`w-2 h-2 rounded-full ${cloudConfig.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
                    {cloudConfig.enabled ? '구글 드라이브 동기화 중' : '로컬 저장소 사용 중'}
                </div>
            </div>
        </div>
    );

    const renderAdmin = () => (
        <div className="min-h-screen bg-gray-50 pb-12">
            <header className="bg-white shadow px-4 py-4 flex justify-between items-center sticky top-0 z-20">
                <h1 className="text-2xl font-bold text-gray-800">관리자 대시보드</h1>
                <div className="flex gap-2">
                    <button onClick={() => setViewMode('cloud_setup')} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold border border-blue-200 hover:bg-blue-100 transition-colors">구글 연동 설정</button>
                    <button onClick={() => setViewMode('landing')} className="text-gray-600 font-bold px-3 py-1.5">나가기</button>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                <input type="file" ref={sessionFileInputRef} className="hidden" onChange={handleSessionStaffUpdate} accept=".xlsx,.xls,.csv,.txt" />

                {newSessionType === 'school' && (
                    <section className="bg-white rounded-xl shadow p-6 border-l-4 border-indigo-500 animate-fade-in">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">교직원 명단 관리 (학교용)</h2>
                        <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-lg">
                            <div className="flex-1">
                                <span className="font-bold text-gray-700 block">현재 등록된 교직원: <span className="text-indigo-600 font-extrabold text-lg">{globalStaffList.length}명</span></span>
                                <p className="text-[10px] text-gray-400 mt-1">※ 외부공개연수(교육청/타학교) 생성 시에는 명단이 필요하지 않습니다.</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleResetStaffList}
                                    className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-bold bg-white hover:bg-red-50 transition-all active:scale-95 shadow-sm"
                                >
                                    명단 초기화
                                </button>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="px-3 py-2 border border-green-600 text-green-700 rounded-lg text-sm font-bold bg-white hover:bg-green-50 transition-all active:scale-95 shadow-sm flex items-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    양식 다운로드
                                </button>
                                <label className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg cursor-pointer text-sm font-bold hover:bg-gray-50 transition-all active:scale-95 shadow-sm flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    명단 업로드 (Excel)
                                    <input type="file" onChange={handleGlobalStaffUpload} className="hidden" accept=".xlsx,.xls,.csv,.txt" />
                                </label>
                            </div>
                        </div>
                    </section>
                )}

                <section className="bg-white rounded-xl shadow p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">새 연수 등록</h2>
                    <form onSubmit={handleCreateSession} className="space-y-4">
                        <div className="flex gap-4">
                            {['school', 'office'].map(type => (
                                <label key={type} className={`flex-1 p-3 rounded-lg border cursor-pointer text-center ${newSessionType === type ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'bg-white border-gray-200 text-gray-600'}`}>
                                    <input type="radio" checked={newSessionType === type} onChange={() => setNewSessionType(type as any)} className="hidden" />
                                    {type === 'school' ? '🏫 학교용' : '🏢 외부공개'}
                                </label>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="연수명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" />
                            <input type="text" value={newSchool} onChange={e => setNewSchool(e.target.value)} placeholder="기관명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" />
                            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                            <input type="text" value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="시간 (예: 15:00~17:00)" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" />
                        </div>
                        <div className="flex items-center gap-4 bg-gray-50 p-3 rounded">
                            <label className="flex items-center gap-2 font-bold text-sm cursor-pointer text-gray-800"><input type="checkbox" checked={enableAuth} onChange={e => setEnableAuth(e.target.checked)} /> 인증 비밀번호 설정</label>
                            {enableAuth && <input type="text" value={newAuthCode} onChange={e => setNewAuthCode(e.target.value)} placeholder="비밀번호" className="p-1 border rounded text-sm w-32 outline-none bg-white text-gray-900 placeholder-gray-400" />}
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all active:scale-95">연수 등록</button>
                    </form>
                </section>

                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800">등록된 연수 목록</h2>
                        <button
                            onClick={() => loadSessions(cloudConfig.enabled, cloudConfig.scriptUrl)}
                            className={`px-3 py-1.5 bg-white border border-blue-400 text-blue-600 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-50 transition-all active:scale-95 flex items-center gap-1 ${isLoading ? 'animate-pulse' : ''}`}
                        >
                            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            전체 새로고침
                        </button>
                    </div>
                    <div className="grid gap-4">
                        {sessions.map(session => (
                            <div key={session.id} className="bg-white p-6 rounded-lg shadow flex flex-col md:flex-row justify-between gap-4 border border-transparent hover:border-blue-100 transition-all">
                                <div className="flex-1">
                                    <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800">
                                        <span className={`text-[10px] px-2 py-0.5 rounded border ${session.type === 'office' ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>{session.type === 'office' ? '외부' : '학교'}</span>
                                        {session.title}
                                    </h3>
                                    <div className="text-sm text-gray-500 mt-1">📅 {session.date} | 🏫 {session.schoolName} | <span className="text-blue-600 font-bold">✍️ {session.signatures.length}명 서명</span></div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => loadSessions(cloudConfig.enabled, cloudConfig.scriptUrl)} className="px-3 py-1.5 border border-blue-400 text-blue-500 rounded text-sm font-bold hover:bg-blue-50 active:scale-95 transition-all">새로고침</button>
                                    <button onClick={() => setShareModalSession(session)} className="px-3 py-1.5 border border-green-600 text-green-600 rounded text-sm font-bold hover:bg-green-50 active:scale-95 transition-all">링크 공유</button>
                                    {session.type === 'school' && (
                                        <button onClick={() => openSessionStaffUpdate(session.id)} className="px-3 py-1.5 border border-indigo-600 text-indigo-600 rounded text-sm font-bold hover:bg-indigo-50 active:scale-95 transition-all">명단 업데이트</button>
                                    )}
                                    <button onClick={() => { setSelectedSessionId(session.id); setViewMode('report'); }} className="px-3 py-1.5 border border-blue-600 text-blue-600 rounded text-sm font-bold hover:bg-blue-50 active:scale-95 transition-all">결과 출력</button>
                                    <button onClick={() => handleDeleteSession(session.id)} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50 active:scale-95 transition-all">삭제</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {shareModalSession && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShareModalSession(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center animate-pop-in" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800 mb-4">서명 링크 공유</h3>
                        <div className="bg-gray-100 p-4 rounded-lg mb-4 flex justify-center">
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getShareUrl(shareModalSession.id))}`} alt="QR" className="w-40 h-40" />
                        </div>
                        <div className="flex gap-2 mb-4">
                            <input readOnly value={getShareUrl(shareModalSession.id)} className="flex-1 bg-gray-50 border rounded px-2 py-1 text-xs truncate text-gray-900" />
                            <button onClick={() => { navigator.clipboard.writeText(getShareUrl(shareModalSession.id)); showNotification('복사됨', 'success'); }} className="bg-gray-200 px-2 rounded text-xs active:bg-gray-300 text-gray-800">복사</button>
                        </div>
                        <button onClick={() => setShareModalSession(null)} className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 active:scale-95 transition-all">닫기</button>
                    </div>
                </div>
            )}
        </div>
    );

    const renderSigner = () => {
        if (isLoading && sessions.length === 0) {
            return (
                <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-600 font-bold">연수 정보를 불러오는 중입니다...</p>
                </div>
            );
        }

        if (!selectedSessionId) {
            return (
                <div className="min-h-screen bg-gray-100 p-4">
                    <h1 className="text-xl font-bold mb-6 text-center text-gray-800">서명할 연수 선택</h1>
                    <div className="grid gap-4 max-w-lg mx-auto">
                        {sessions.map(s => (
                            <button key={s.id} onClick={() => setSelectedSessionId(s.id)} className="bg-white p-6 rounded-xl shadow-md text-left active:scale-95 transition-all border-l-4 border-blue-500 hover:bg-blue-50">
                                <div className="text-xs text-gray-500 mb-1 font-bold">{s.date}</div>
                                <h3 className="text-lg font-bold text-gray-800">{s.title}</h3>
                                <p className="text-sm text-gray-600">{s.schoolName}</p>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        const session = sessions.find(s => s.id === selectedSessionId);
        if (!session) return null;

        if (session.authCode && !isSessionAuthenticated) {
            return (
                <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl animate-pop-in">
                        <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">{session.title}</h2>
                        <p className="text-sm text-gray-500 mb-6 text-center">{session.schoolName} | {session.date}</p>

                        <div className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl text-center">
                                <p className="text-blue-700 font-bold">인증 비밀번호를 입력해주세요.</p>
                            </div>

                            <form onSubmit={handleAuthSubmit}>
                                <input
                                    type="tel"
                                    value={authInput}
                                    onChange={e => setAuthInput(e.target.value)}
                                    className={`w-full text-center text-4xl font-bold py-4 border-2 rounded-xl mb-4 outline-none transition-colors bg-white text-gray-900 ${authError ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-blue-500'}`}
                                    placeholder="****"
                                    autoFocus
                                />
                                {authError && <p className="text-red-500 text-xs text-center mb-4 font-bold">비밀번호가 일치하지 않습니다.</p>}

                                <div className="flex gap-2">
                                    {!isLinkAccess && (
                                        <button type="button" onClick={() => setSelectedSessionId(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-xl active:scale-95 transition-all">뒤로가기</button>
                                    )}
                                    <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all">확인</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            );
        }

        if (session.type === 'school') {
            const filtered = session.staffList.filter(s => s.name.includes(searchTerm) || s.department.includes(searchTerm));
            return (
                <div className="min-h-screen bg-gray-50 flex flex-col animate-fade-in">
                    <div className="bg-white p-4 shadow flex-none sticky top-0 z-10">
                        <div className="flex items-center mb-4">
                            <button onClick={() => !isLinkAccess && setSelectedSessionId(null)} className="p-2 text-xl active:scale-90 transition-transform text-gray-800">⬅️</button>
                            <h2 className="font-bold flex-1 text-center truncate px-2 text-gray-800">{session.title}</h2>
                        </div>
                        <div className="relative">
                            <input type="text" className="w-full p-3 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500" placeholder="성명 검색" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {filtered.map(staff => {
                            const isSigned = session.signatures.some(sig => sig.staffId === staff.id);
                            return (
                                <button key={staff.id} onClick={() => handleSchoolStaffSelect(staff)} className={`w-full p-4 rounded-xl shadow-sm flex justify-between items-center transition-all active:scale-95 active:bg-gray-100 ${isSigned ? 'bg-green-50 border border-green-200' : 'bg-white border border-transparent'}`}>
                                    <div className="text-left flex-1 min-w-0">
                                        <p className={`font-bold text-lg leading-tight whitespace-normal break-words ${isSigned ? 'text-green-800' : 'text-gray-800'}`}>{staff.name}</p>
                                        <p className="text-sm text-gray-500 leading-tight whitespace-normal break-words">{staff.department}</p>
                                    </div>
                                    {isSigned && <span className="text-green-600 font-bold flex items-center gap-1">서명완료</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl animate-pop-in">
                    <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 border-b pb-4">{session.title}</h2>
                    <form onSubmit={handleOfficeInfoSubmit} className="space-y-4">
                        <input type="text" value={manualInput.department} onChange={e => setManualInput({ ...manualInput, department: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="소속 입력" required />
                        <input type="text" value={manualInput.position} onChange={e => setManualInput({ ...manualInput, position: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="직위 입력" required />
                        <input type="text" value={manualInput.name} onChange={e => setManualInput({ ...manualInput, name: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="성명 입력" required />
                        <button type="submit" className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 active:bg-blue-700 transition-all">확인 및 서명</button>
                    </form>
                </div>
            </div>
        );
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([{ '직위': '교사', '성명': '홍길동' }], { header: ['직위', '성명'] });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "양식");
        XLSX.writeFile(wb, "명단양식.xlsx");
    };

    if (isInitializing) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 font-bold">시스템 초기화 중...</div>;

    return (
        <>
            {viewMode === 'landing' && renderLanding()}
            {viewMode === 'admin' && renderAdmin()}
            {viewMode === 'signer' && renderSigner()}

            {viewMode === 'report' && selectedSessionId && (
                <PrintReport
                    session={sessions.find(s => s.id === selectedSessionId)!}
                    staffList={sessions.find(s => s.id === selectedSessionId)?.staffList || []}
                    onClose={() => setViewMode('admin')}
                    onDeleteSignature={handleSignatureDelete}
                />
            )}
            {viewMode === 'cloud_setup' && <CloudSetup currentUrl={cloudConfig.scriptUrl} onSave={handleCloudSetupSave} onCancel={() => setViewMode('admin')} />}
            {isSigning && selectedStaff && <SignaturePad name={selectedStaff.name} sessionTitles={getTargetSessionTitles()} onSave={handleSignatureSave} onCancel={() => { setIsSigning(false); setSelectedStaff(null); }} />}

            {renderGlobalLoading()}
            {renderNotification()}
            {isAuthModalOpen && renderAuthModal()}
            {deleteConfirmInfo && renderDeleteModal()}
        </>
    );

    function renderAuthModal() {
        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
                    <h3 className="text-xl font-bold text-center mb-4 text-gray-800">인증번호 입력</h3>
                    <form onSubmit={handleAuthSubmit}>
                        <input type="tel" value={authInput} onChange={e => setAuthInput(e.target.value)} className={`w-full text-center text-4xl font-bold py-4 border-2 rounded-xl mb-4 outline-none transition-colors bg-white text-gray-900 ${authError ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-blue-500'}`} autoFocus />
                        {authError && <p className="text-red-500 text-xs text-center mb-4 font-bold">인증번호가 일치하지 않습니다.</p>}
                        <div className="flex gap-2">
                            <button type="button" disabled={isLoading} onClick={() => { setIsAuthModalOpen(false); setPendingStaff(null); }} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 active:scale-95 transition-all">취소</button>
                            <button type="submit" disabled={isLoading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition-all">확인</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    function renderDeleteModal() {
        if (!deleteConfirmInfo) return null;
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl animate-pop-in">
                    <h3 className="text-lg font-bold mb-2 text-gray-800">{deleteConfirmInfo.staffName}님의 서명을 삭제하시겠습니까?</h3>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">같은 날 실시된 모든 연수의 서명을 한꺼번에 삭제하거나, 현재 보고 있는 연수의 서명만 개별 삭제할 수 있습니다.</p>
                    <div className="flex flex-col gap-2">
                        {deleteConfirmInfo.relatedSessionIds.length > 1 && (
                            <button onClick={() => executeDelete('all')} disabled={isLoading} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-md active:scale-95 transition-all">전체 연수 서명 삭제</button>
                        )}
                        <button onClick={() => executeDelete('single')} disabled={isLoading} className="w-full py-3 border-2 border-red-200 text-red-600 rounded-xl font-bold active:scale-95 transition-all">현재 연수만 삭제</button>
                        <button onClick={() => setDeleteConfirmInfo(null)} disabled={isLoading} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-600 mt-2 active:scale-95 transition-all">취소</button>
                    </div>
                </div>
            </div>
        );
    }
};

export default App;
