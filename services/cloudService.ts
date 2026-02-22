
import { TrainingSession, Signature } from '../types';

// Helper: POST request (Simple Request to avoid CORS Preflight if possible)
const postToGAS = async (url: string, action: string, payload: any) => {
  const cleanUrl = url.trim();
  const body = JSON.stringify({ action, ...payload });
  
  if (!cleanUrl.startsWith('http')) throw new Error("URL이 올바르지 않습니다.");

  // Method: POST
  // Credentials: omit (Crucial for anonymous access avoiding multi-login 403)
  // Content-Type: text/plain (Crucial to avoid OPTIONS preflight)
  const response = await fetch(cleanUrl, {
    method: 'POST',
    redirect: 'follow',
    credentials: 'omit', 
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: body,
  });
  
  if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
  }

  const text = await response.text();
  
  try {
    const json = JSON.parse(text);
    if (json.status !== 'success') {
      throw new Error(json.message || 'Script Error');
    }
    return json;
  } catch (e) {
    if (text.trim().startsWith('<')) {
        throw new Error("HTML 응답 수신됨. (원인: 학교/기관 계정에서 '모든 사용자' 권한이 막혀있거나 로그인이 필요한 상태)");
    }
    throw e;
  }
};

// Helper: GET request (Fallback)
const getFromGAS = async (url: string) => {
    const cleanUrl = url.trim();
    const delimiter = cleanUrl.includes('?') ? '&' : '?';
    const getUrl = `${cleanUrl}${delimiter}action=getSessions&nocache=${Date.now()}`;
    
    const response = await fetch(getUrl, { 
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit' 
    });
    
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    
    const text = await response.text();
    const json = JSON.parse(text);
    if (json.status === 'success') return json.data;
    throw new Error(json.message || 'Script Error');
};

export const fetchCloudSessions = async (url: string): Promise<TrainingSession[]> => {
  // Strategy V2.0: Try POST first -> If Network Error -> Try GET
  try {
    const res = await postToGAS(url, 'getSessions', {});
    return res.data;
  } catch (postError: any) {
    console.warn("POST failed, attempting GET fallback...", postError);
    
    try {
        const data = await getFromGAS(url);
        return data;
    } catch (getError: any) {
        console.error("GET fallback also failed:", getError);
        
        // Combine errors for better debugging
        let msg = "서버 연결 실패.";
        const combinedMsg = (postError.message + getError.message).toLowerCase();

        if (combinedMsg.includes('html') || combinedMsg.includes('권한')) {
            msg = "권한 설정 오류: 학교 계정(Workspace)이라 '모든 사용자' 접속이 차단되었습니다. 개인 구글 계정으로 시도하세요.";
        } else if (combinedMsg.includes('failed to fetch')) {
            msg = "네트워크 차단됨: 보안 네트워크(학교망) 문제일 수 있습니다.";
        }
        throw new Error(msg);
    }
  }
};

export const createCloudSession = async (url: string, session: TrainingSession): Promise<boolean> => {
  try {
    await postToGAS(url, 'createSession', { session });
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const deleteCloudSession = async (url: string, sessionId: string): Promise<boolean> => {
  try {
    await postToGAS(url, 'deleteSession', { sessionId });
    return true;
  } catch (e) {
    console.error("Delete failed:", e);
    return false;
  }
};

export const sendSignatureToCloud = async (url: string, sessionId: string, signature: Signature): Promise<boolean> => {
  try {
    await postToGAS(url, 'addSignature', { sessionId, signature });
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const addSignatureBatch = async (url: string, sessionIds: string[], signature: Signature): Promise<boolean> => {
  try {
    await postToGAS(url, 'addSignatureBatch', { sessionIds, signature });
    return true;
  } catch (e) {
    console.error("Batch add failed:", e);
    return false;
  }
};

export const removeSignatureFromCloud = async (url: string, sessionId: string, staffId: string): Promise<boolean> => {
  try {
    await postToGAS(url, 'removeSignature', { sessionId, staffId });
    return true;
  } catch (e) {
    console.error("Remove signature failed:", e);
    return false;
  }
};

export const removeSignatureBatch = async (url: string, sessionIds: string[], staffId: string): Promise<boolean> => {
  try {
    await postToGAS(url, 'removeSignatureBatch', { sessionIds, staffId });
    return true;
  } catch (e) {
    console.error("Batch remove failed:", e);
    return false;
  }
};
