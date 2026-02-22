import { TrainingSession, Signature, Staff } from '../types';

const STORAGE_KEY = 'training_app_sessions_v1';
const STAFF_LIST_KEY = 'training_app_staff_list_v1';

export const getSessions = (): TrainingSession[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load sessions", e);
    return [];
  }
};

export const saveSession = (session: TrainingSession): void => {
  const sessions = getSessions();
  const existingIndex = sessions.findIndex(s => s.id === session.id);
  
  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

export const deleteSession = (sessionId: string): void => {
  const sessions = getSessions().filter(s => s.id !== sessionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

export const addSignatureToSession = (sessionId: string, signature: Signature): boolean => {
  const sessions = getSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  
  if (sessionIndex === -1) return false;
  
  const session = sessions[sessionIndex];
  
  // Check if already signed
  const alreadySigned = session.signatures.some(s => s.staffId === signature.staffId);
  if (alreadySigned) {
    // Update existing signature
    session.signatures = session.signatures.map(s => s.staffId === signature.staffId ? signature : s);
  } else {
    if (session.signatures.length >= session.maxParticipants) {
      return false; // Full
    }
    session.signatures.push(signature);
  }
  
  sessions[sessionIndex] = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return true;
};

export const removeSignatureFromSession = (sessionId: string, staffId: string): boolean => {
  const sessions = getSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  
  if (sessionIndex === -1) return false;
  
  const session = sessions[sessionIndex];
  const initialLength = session.signatures.length;
  session.signatures = session.signatures.filter(s => s.staffId !== staffId);
  
  if (session.signatures.length === initialLength) return false; // Nothing removed

  sessions[sessionIndex] = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return true;
};

// --- Staff List Management ---

export const getStaffList = (): Staff[] => {
  try {
    const data = localStorage.getItem(STAFF_LIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load staff list", e);
    return [];
  }
};

export const saveStaffList = (staffList: Staff[]): void => {
  localStorage.setItem(STAFF_LIST_KEY, JSON.stringify(staffList));
};

// --- Data Sync (Export/Import) ---

export const getAllData = () => {
  return {
    sessions: getSessions(),
    staffList: getStaffList(),
    exportedAt: Date.now()
  };
};

export const mergeImportData = (data: any): { success: boolean, message: string } => {
  try {
    let updatedCount = 0;
    let newCount = 0;

    // 1. Merge Staff List (Overwrite if newer exists)
    if (Array.isArray(data.staffList) && data.staffList.length > 0) {
       // Currently we simply update the global list to the imported one
       // In a real app we might want to prompt, but for "Sync", replacing is usually desired.
       localStorage.setItem(STAFF_LIST_KEY, JSON.stringify(data.staffList));
    }

    // 2. Merge Sessions
    if (Array.isArray(data.sessions)) {
      const currentSessions = getSessions();
      
      data.sessions.forEach((importedSession: TrainingSession) => {
        const index = currentSessions.findIndex(s => s.id === importedSession.id);
        
        if (index >= 0) {
          // Session exists.
          // If imported session has MORE signatures, let's assume it's the updated one (e.g. from tablet)
          // Or if timestamps were tracked properly we'd use that. 
          // For now, let's replace the local session with the imported one to ensure we get the signatures.
          currentSessions[index] = importedSession;
          updatedCount++;
        } else {
          // New session (e.g. created on PC, imported to Tablet)
          currentSessions.push(importedSession);
          newCount++;
        }
      });
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSessions));
    }

    return { 
      success: true, 
      message: `동기화 완료: ${newCount}개 연수 추가, ${updatedCount}개 연수 업데이트됨.` 
    };

  } catch (e) {
    console.error("Import failed", e);
    return { success: false, message: "데이터 형식이 올바르지 않습니다." };
  }
};