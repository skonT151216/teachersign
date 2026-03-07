
const CONFIG_FILENAME = 'training_app_config_v1.json';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export interface AppConfig {
  scriptUrl: string;
  lastSyncedAt: number;
}

export class SyncService {
  private static clientId: string = '';
  private static accessToken: string | null = null;

  static setClientId(id: string) {
    this.clientId = id;
    localStorage.setItem('training_app_google_client_id', id);
  }

  static getClientId() {
    return this.clientId || localStorage.getItem('training_app_google_client_id') || '';
  }

  static async login(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.getClientId()) {
        reject(new Error('Google Client ID가 설정되지 않았습니다.'));
        return;
      }

      // Check if library is loaded
      // @ts-ignore
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        reject(new Error('구글 인증 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.'));
        return;
      }

      // Set a safety timeout to avoid infinite "Loading" state
      const timeout = setTimeout(() => {
        reject(new Error('인증 요청 시간이 초과되었습니다. 팝업 차단 여부를 확인해주세요.'));
      }, 60000); // 1 minute timeout

      try {
        // @ts-ignore
        const client = google.accounts.oauth2.initTokenClient({
          client_id: this.getClientId(),
          scope: SCOPES,
          callback: (response: any) => {
            clearTimeout(timeout);
            if (response.error) {
              reject(new Error(`인증 오류: ${response.error}`));
            } else if (!response.access_token) {
              reject(new Error('인증 토큰을 받지 못했습니다.'));
            } else {
              this.accessToken = response.access_token;
              resolve(response.access_token);
            }
          },
        });
        client.requestAccessToken();
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  static async findConfigFile(): Promise<string | null> {
    try {
      if (!this.accessToken) await this.login();

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${CONFIG_FILENAME}' and trashed=false`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`파일 조회 실패: ${response.status} ${errorData.error?.message || ''}`);
      }

      const data = await response.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
      return null;
    } catch (e: any) {
      console.error('findConfigFile failed:', e);
      throw e;
    }
  }

  static async loadConfigFromDrive(): Promise<AppConfig | null> {
    try {
      const fileId = await this.findConfigFile();
      if (!fileId) return null;

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.error('Failed to load config from Drive', e);
      return null; // Don't throw for loading, just return null
    }
  }

  static async saveConfigToDrive(config: AppConfig): Promise<boolean> {
    try {
      if (!this.accessToken) await this.login();
      const fileId = await this.findConfigFile();

      const metadata = {
        name: CONFIG_FILENAME,
        mimeType: 'application/json',
      };

      const formData = new FormData();
      formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      formData.append(
        'file',
        new Blob([JSON.stringify(config)], { type: 'application/json' })
      );

      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const response = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: formData,
      });

      return response.ok;
    } catch (e) {
      console.error('Failed to save config to Drive', e);
      return false;
    }
  }
}
