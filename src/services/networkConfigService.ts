import QRCode from 'qrcode';
import { storageService } from '../utils/storageService';
import { SecurityService } from '../core/security/SecurityService';
import {
  getClientServerSessionToken,
  clearClientServerSessionToken,
} from '../core/security/serverSession';

function getSessionActorHeaders(): Record<string, string> {
  try {
    const serverToken = getClientServerSessionToken();
    const parsed = SecurityService.getSessionSecure('gmao_session_v2');
    const user =
      parsed && typeof parsed === 'object'
        ? parsed.payload && typeof parsed.payload === 'object'
          ? parsed.payload
          : parsed
        : storageService.getItem('gmao_active_user');

    if (!user || typeof user !== 'object') {
      return serverToken
        ? {
            Authorization: `Bearer ${serverToken}`,
            'X-GMAO-SESSION': serverToken,
          }
        : {};
    }

    const actorId = String(user.personnelId || user.code || user.id || user.username || '').trim();
    const actorName = String(user.nom || user.name || user.username || user.role || '').trim();
    const actorRole = typeof user.role === 'string' && user.role.trim() ? user.role.trim().toUpperCase() : '';

    return {
      ...(actorId ? { 'x-gmao-actor-id': actorId } : {}),
      ...(actorName ? { 'x-gmao-actor': actorName } : {}),
      ...(actorRole ? { 'x-gmao-role': actorRole } : {}),
      ...(serverToken
        ? {
            Authorization: `Bearer ${serverToken}`,
            'X-GMAO-SESSION': serverToken,
          }
        : {}),
    };
  } catch {
    return {};
  }
}

export type NetworkNodeMode = 'HOST' | 'LAN_CLIENT';
export type LanNodeMode = NetworkNodeMode;

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  family: string;
}

export interface NetworkHostInfo {
  online: boolean;
  hostname: string;
  platform?: string;
  port: number;
  primaryIp: string;
  interfaces: NetworkInterfaceInfo[];
  urls: {
    desktop: string;
    mobile: string;
  };
  version: number;
  updatedAt: string | null;
  connectedClients: number;
}

export interface RevisionEventPayload {
  type: 'CONNECTED' | 'STATE_UPDATED';
  version: number;
  updatedAt: string;
  actor?: string;
  action?: string;
  entity?: string;
}

const NODE_MODE_STORAGE_KEY = 'gmao_network_node_mode';
const CUSTOM_HOST_IP_STORAGE_KEY = 'gmao_custom_lan_host_ip';
const REMOTE_HOST_URL_STORAGE_KEY = 'gmao_remote_lan_host_url';

export const networkConfigService = {
  /**
   * Automatically detects whether the current browser instance is running on the Host machine
   * (`localhost` / `127.0.0.1`) or connecting as a LAN Client (`192.168.x.x`, mobile, etc.),
   * while respecting an explicit user override if set.
   */
  detectDefaultNodeMode(hostname?: string): NetworkNodeMode {
    const host =
      hostname ??
      (typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost');
    const clean = String(host || '').trim().toLowerCase();
    if (!clean || clean === 'localhost' || clean === '127.0.0.1' || clean === '::1') {
      return 'HOST';
    }
    return 'LAN_CLIENT';
  },

  getNodeMode(): NetworkNodeMode {
    const saved = storageService.getItem(NODE_MODE_STORAGE_KEY);
    if (saved === 'HOST' || saved === 'LAN_CLIENT') {
      return saved;
    }
    return this.detectDefaultNodeMode();
  },

  setNodeMode(mode: NetworkNodeMode): void {
    if (mode !== 'HOST' && mode !== 'LAN_CLIENT') return;
    storageService.setItem(NODE_MODE_STORAGE_KEY, mode);
  },

  getCustomHostIp(): string {
    const saved = storageService.getItem(CUSTOM_HOST_IP_STORAGE_KEY);
    return typeof saved === 'string' ? saved.trim() : '';
  },

  setCustomHostIp(ipOrHost: string): void {
    const clean = String(ipOrHost || '').trim();
    storageService.setItem(CUSTOM_HOST_IP_STORAGE_KEY, clean);
  },

  /**
   * Normalizes and stores a remote host URL or IP:port for LAN_CLIENT mode
   * using a dedicated storage key isolated from the HOST custom broadcast IP.
   */
  setRemoteHostUrl(urlOrHost: string, defaultPort = 3000): string {
    const clean = String(urlOrHost || '')
      .trim()
      .replace(/\/+$/, '');
    if (!clean) {
      storageService.setItem(REMOTE_HOST_URL_STORAGE_KEY, '');
      return '';
    }
    const withoutProto = clean.replace(/^https?:\/\//i, '');
    const hasPort = /:\d+$/.test(withoutProto);
    const normalized = /^https?:\/\//i.test(clean)
      ? hasPort
        ? clean
        : `${clean}:${defaultPort}`
      : hasPort
      ? `http://${withoutProto}`
      : `http://${withoutProto}:${defaultPort}`;
    storageService.setItem(REMOTE_HOST_URL_STORAGE_KEY, normalized);
    return normalized;
  },

  getRemoteHostUrl(): string {
    const dedicated = storageService.getItem(REMOTE_HOST_URL_STORAGE_KEY);
    if (typeof dedicated === 'string' && dedicated.trim()) {
      return this.buildShareUrls(dedicated.trim()).desktop;
    }
    // Backward-compatible read only if legacy key explicitly held an http(s):// URL
    const legacy = this.getCustomHostIp();
    if (legacy && /^https?:\/\//i.test(legacy)) {
      return this.buildShareUrls(legacy).desktop;
    }
    return '';
  },

  /**
   * Resolves an API path (e.g. `/api/gmao/state`).
   * In HOST mode (or when no custom remote host is configured), returns the relative path `/api/...`.
   * In LAN_CLIENT mode with a configured remote host, prefixes the remote host base URL.
   */
  resolveApiUrl(apiPath: string): string {
    const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    if (this.getNodeMode() === 'LAN_CLIENT') {
      const remoteBase = this.getRemoteHostUrl();
      if (remoteBase) {
        return `${remoteBase.replace(/\/+$/, '')}${cleanPath}`;
      }
    }
    return cleanPath;
  },

  /**
   * Builds canonical Desktop & Mobile URLs for a given IPv4/host and port.
   */
  buildShareUrls(ipOrHost: string, port = 3000): { desktop: string; mobile: string } {
    const cleanHost = String(ipOrHost || '127.0.0.1')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    const hasPort = /:\d+$/.test(cleanHost);
    const baseUrl = hasPort ? `http://${cleanHost}` : `http://${cleanHost}:${port}`;
    return {
      desktop: baseUrl,
      mobile: `${baseUrl}/#mobile`,
    };
  },

  /**
   * Queries `/api/network/info` on the backend server to obtain real LAN IPv4 addresses,
   * hostname, active SSE client count, and state revision.
   */
  async fetchNetworkHostInfo(): Promise<NetworkHostInfo> {
    const customIp = this.getCustomHostIp();
    try {
      const response = await fetch(this.resolveApiUrl('/api/network/info'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-gmao-client-origin': 'gmao-web-client',
          ...getSessionActorHeaders(),
        },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const errJson = await response.json().catch(() => ({}));
          if (errJson?.code === 'SERVER_SESSION_INVALID') {
            clearClientServerSessionToken();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('gmao:server_session_expired', {
                  detail: { status: response.status, message: errJson?.message },
                })
              );
            }
          }
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const remoteUrl = this.getRemoteHostUrl();
      const cleanRemoteIp = remoteUrl.replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
      const cleanCustomIp = customIp.replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
      const effectiveIp =
        (this.getNodeMode() === 'LAN_CLIENT' && cleanRemoteIp) ||
        (data.primaryIp && data.primaryIp !== '127.0.0.1' ? data.primaryIp : '') ||
        cleanCustomIp ||
        data.primaryIp ||
        '127.0.0.1';
      const port = Number(data.port) || 3000;
      const urls = this.buildShareUrls(effectiveIp, port);

      return {
        online: true,
        hostname: data.hostname || 'CIOB-HOST-SERVER',
        platform: data.platform || 'linux',
        port,
        primaryIp: effectiveIp,
        interfaces: Array.isArray(data.interfaces) ? data.interfaces : [],
        urls,
        version: typeof data.version === 'number' ? data.version : 1,
        updatedAt: data.updatedAt || null,
        connectedClients: typeof data.connectedClients === 'number' ? data.connectedClients : 0,
      };
    } catch {
      const remoteUrl = this.getRemoteHostUrl();
      const fallbackHost =
        (this.getNodeMode() === 'LAN_CLIENT' && remoteUrl) ||
        customIp ||
        (typeof window !== 'undefined' && window.location?.hostname
          ? window.location.hostname
          : '192.168.1.100');
      const fallbackPort =
        typeof window !== 'undefined' && window.location?.port
          ? Number(window.location.port) || 3000
          : 3000;
      return {
        online: false,
        hostname: 'Poste-Local-Autonome',
        port: fallbackPort,
        primaryIp: fallbackHost,
        interfaces: [],
        urls: this.buildShareUrls(fallbackHost, fallbackPort),
        version: 1,
        updatedAt: null,
        connectedClients: 0,
      };
    }
  },

  async fetchHostNetworkInfo(): Promise<NetworkHostInfo> {
    return this.fetchNetworkHostInfo();
  },

  /**
   * Lightweight revision poll (`/api/gmao/revision`) used on window focus or fallback timer.
   */
  async fetchServerRevision(): Promise<{ online: boolean; version: number; updatedAt: string | null }> {
    try {
      const res = await fetch(this.resolveApiUrl('/api/gmao/revision'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-gmao-client-origin': 'gmao-web-client',
          ...getSessionActorHeaders(),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return {
        online: true,
        version: typeof json?.version === 'number' ? json.version : 1,
        updatedAt: json?.updatedAt || null,
      };
    } catch {
      return { online: false, version: 0, updatedAt: null };
    }
  },

  async checkServerRevision(): Promise<{ online: boolean; version: number; updatedAt: string | null }> {
    return this.fetchServerRevision();
  },

  /**
   * Subscribes to real-time revision updates from the Host via authenticated SSE ticket
   * (`/api/gmao/events/ticket` -> `/api/gmao/events?ticket=...`) and window focus checks (`P3.4`).
   */
  subscribeToRevisionStream(
    onRevisionUpdate: (event: RevisionEventPayload) => void,
    onError?: () => void
  ): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    let isDisposed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    const closeEventSource = () => {
      if (eventSource) {
        try {
          eventSource.close();
        } catch {
          // ignore
        }
        eventSource = null;
      }
    };

    const scheduleReconnect = () => {
      if (isDisposed || retryCount >= 5) return;
      const delayMs = Math.min(30_000, 1500 * Math.pow(2, retryCount));
      retryCount += 1;
      reconnectTimer = setTimeout(() => {
        if (!isDisposed) {
          void connectWithTicket();
        }
      }, delayMs);
    };

    const connectWithTicket = async () => {
      if (isDisposed || typeof EventSource === 'undefined') return;
      try {
        const res = await fetch(this.resolveApiUrl('/api/gmao/events/ticket'), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-gmao-client-origin': 'gmao-web-client',
            ...getSessionActorHeaders(),
          },
          body: '{}',
        });
        if (!res.ok) {
          onError?.();
          if (res.status !== 401 && res.status !== 403) {
            scheduleReconnect();
          }
          return;
        }
        const json = await res.json();
        const ticket = typeof json?.ticket === 'string' ? json.ticket.trim() : '';
        if (!ticket || isDisposed) return;

        closeEventSource();
        const streamUrl = this.resolveApiUrl(`/api/gmao/events?ticket=${encodeURIComponent(ticket)}`);
        const es = new EventSource(streamUrl);
        eventSource = es;

        es.onopen = () => {
          retryCount = 0;
        };

        es.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(evt.data);
            if (parsed && typeof parsed.version === 'number') {
              onRevisionUpdate(parsed);
            }
          } catch {
            // ignore malformed frame
          }
        };

        es.onerror = () => {
          closeEventSource();
          onError?.();
          scheduleReconnect();
        };
      } catch {
        onError?.();
        scheduleReconnect();
      }
    };

    void connectWithTicket();

    const handleWindowFocus = async () => {
      const rev = await this.fetchServerRevision();
      if (rev.online && rev.version > 0) {
        onRevisionUpdate({
          type: 'STATE_UPDATED',
          version: rev.version,
          updatedAt: rev.updatedAt || new Date().toISOString(),
        });
      }
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      isDisposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      closeEventSource();
      window.removeEventListener('focus', handleWindowFocus);
    };
  },

  subscribeToServerEvents(handlers: {
    onConnected?: () => void;
    onStateUpdated?: (payload: RevisionEventPayload) => void;
    onError?: () => void;
  }): () => void {
    return this.subscribeToRevisionStream(
      (payload) => {
        if (payload.type === 'CONNECTED') {
          handlers?.onConnected?.();
        } else if (payload.type === 'STATE_UPDATED') {
          handlers?.onStateUpdated?.(payload);
        }
      },
      handlers?.onError
    );
  },

  /**
   * Generates a real, scannable ISO/IEC 18004 QR Code matrix (100% offline via `qrcode`)
   * with standard Reed-Solomon error correction (Level M) for mobile LAN & machine passport scanning.
   */
  generateQrMatrix(payload: string): boolean[][] {
    const cleanText = String(payload || 'http://127.0.0.1:3000').trim() || 'http://127.0.0.1:3000';
    const qr = QRCode.create(cleanText, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    const matrix: boolean[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => Boolean(data[r * size + c]))
    );
    return matrix;
  },

  generateDeterministicQrMatrix(payload: string): boolean[][] {
    return this.generateQrMatrix(payload);
  },
};

export default networkConfigService;
