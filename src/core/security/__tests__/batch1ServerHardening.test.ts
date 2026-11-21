// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { createGmaoApiApp } from '../../../../server';
import { mountEntityAndStateRoutes } from '../../../server/routes/entityRoutes';
import { createDefaultState } from '../../../server/persistence/stateStore';
import { pbkdf2Sha256Hex, randomBytesHex } from '../nativeCrypto';

function makePbkdf2Hash(plainPassword: string): string {
  const saltHex = randomBytesHex(16);
  const hashHex = pbkdf2Sha256Hex(plainPassword, saltHex, 1000, 32);
  return `pbkdf2:v1:${saltHex}:1000:${hashHex}`;
}

function sendHttpRequest(params: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const bodyStr = params.body !== undefined ? JSON.stringify(params.body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: params.port,
        path: params.path,
        method: params.method,
        headers: {
          ...(bodyStr
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(Buffer.byteLength(bodyStr)),
              }
            : {}),
          ...(params.headers || {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let json: any = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            json,
            raw,
          });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe('Batch 1 Server Hardening — GET /api/gmao/state RBAC Parity & Serialized Mutation Mutex', () => {
  let tempDir = '';
  let server: http.Server | null = null;
  let cleanupApp: (() => void) | null = null;

  const TEST_SECRET = 'ciob-gmao-batch1-hardening-secret-0123456789abcdef';
  const PASS = 'Batch1_S3cure_2026!';

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    if (cleanupApp) {
      cleanupApp();
      cleanupApp = null;
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('enforces exact endpoint-parity RBAC filtering on GET /api/gmao/state for ADMIN, RESPONSABLE_MAINTENANCE, TECHNICIEN, and VIEWER', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmao-batch1-rbac-'));
    const passHash = makePbkdf2Hash(PASS);

    const instance = createGmaoApiApp({
      dataDir: tempDir,
      port: 0,
      isProduction: false,
      sessionSecret: TEST_SECRET,
      initialState: {
        users: [
          { id: 'u-admin', username: 'admin', name: 'Admin', role: 'ADMIN', isActive: true, passwordHash: passHash },
          { id: 'u-resp', username: 'resp', name: 'Chef Maint', role: 'RESPONSABLE_MAINTENANCE', isActive: true, passwordHash: passHash },
          { id: 'u-tech', username: 'tech1', name: 'Tech One', role: 'TECHNICIEN', isActive: true, passwordHash: passHash },
          { id: 'u-view', username: 'viewer1', name: 'Viewer One', role: 'VIEWER', isActive: true, passwordHash: passHash },
        ],
        authAccounts: [
          { id: 'u-admin', username: 'admin', name: 'Admin', role: 'ADMIN', isActive: true, passwordHash: passHash },
          { id: 'u-resp', username: 'resp', name: 'Chef Maint', role: 'RESPONSABLE_MAINTENANCE', isActive: true, passwordHash: passHash },
          { id: 'u-tech', username: 'tech1', name: 'Tech One', role: 'TECHNICIEN', isActive: true, passwordHash: passHash },
          { id: 'u-view', username: 'viewer1', name: 'Viewer One', role: 'VIEWER', isActive: true, passwordHash: passHash },
        ],
        auditEvents: [
          { id: 'AUD-1', actionType: 'STOCK_PRICE_CHANGED', entityType: 'STOCK', entityId: 'R1', timestamp: '2026-01-01T00:00:00Z' },
        ],
        machines: [
          { id: 'M-01', id_machine_registered: 'M-01', code: 'M-01', designation: 'Presse 1' },
        ],
      },
    });
    cleanupApp = instance.cleanup;

    server = await new Promise<http.Server>((resolve) => {
      const s = instance.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;

    const loginAs = async (username: string): Promise<string> => {
      const res = await sendHttpRequest({
        port,
        method: 'POST',
        path: '/api/gmao/auth/login',
        body: { username, password: PASS },
      });
      expect(res.status).toBe(200);
      expect(typeof res.json?.token).toBe('string');
      return res.json.token;
    };

    const [adminToken, respToken, techToken, viewerToken] = await Promise.all([
      loginAs('admin'),
      loginAs('resp'),
      loginAs('tech1'),
      loginAs('viewer1'),
    ]);

    const fetchState = (token: string) =>
      sendHttpRequest({
        port,
        method: 'GET',
        path: '/api/gmao/state',
        headers: { Authorization: `Bearer ${token}` },
      });

    // 1. ADMIN: receives authAccounts (without passwordHash), auditEvents, users, and machines
    const adminRes = await fetchState(adminToken);
    expect(adminRes.status).toBe(200);
    expect(adminRes.json.data.authAccounts).toHaveLength(4);
    expect(adminRes.json.data.authAccounts[0].passwordHash).toBeUndefined();
    expect(adminRes.json.data.auditEvents).toHaveLength(1);
    expect(adminRes.json.data.users).toHaveLength(4);
    expect(adminRes.json.data.machines).toHaveLength(1);

    // 2. RESPONSABLE_MAINTENANCE: receives auditEvents & users, but authAccounts MUST be redacted to []
    const respRes = await fetchState(respToken);
    expect(respRes.status).toBe(200);
    expect(respRes.json.data.authAccounts).toEqual([]);
    expect(respRes.json.data.auditEvents).toHaveLength(1);
    expect(respRes.json.data.users).toHaveLength(4);
    expect(respRes.json.data.machines).toHaveLength(1);

    // 3. TECHNICIEN: authAccounts & auditEvents MUST BOTH be redacted to []
    const techRes = await fetchState(techToken);
    expect(techRes.status).toBe(200);
    expect(techRes.json.data.authAccounts).toEqual([]);
    expect(techRes.json.data.auditEvents).toEqual([]);
    expect(techRes.json.data.machines).toHaveLength(1);

    // 4. VIEWER: authAccounts & auditEvents MUST BOTH be redacted to []
    const viewerRes = await fetchState(viewerToken);
    expect(viewerRes.status).toBe(200);
    expect(viewerRes.json.data.authAccounts).toEqual([]);
    expect(viewerRes.json.data.auditEvents).toEqual([]);
    expect(viewerRes.json.data.machines).toHaveLength(1);
  });

  it('serializes concurrent mutating routes so a persistence failure + rollback in Request A cannot erase Request B', async () => {
    const dbState = createDefaultState();
    dbState.machines = [{ id: 'M-INIT', code: 'M-INIT', designation: 'Initial Machine' }];

    let persistCallIndex = 0;
    const fakePersistState = async (_auditContext?: any, rollbackState?: () => void) => {
      const myCall = ++persistCallIndex;
      await new Promise((resolve) => setTimeout(resolve, myCall === 1 ? 45 : 5));
      if (myCall === 1) {
        rollbackState?.();
        throw new Error('Simulated disk I/O failure on Request A');
      }
      dbState.version = Number(dbState.version || 1) + 1;
      dbState.updatedAt = new Date().toISOString();
    };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).isBootstrapAuthorized = true;
      (req as any).resolvedServerActor = {
        effectiveRole: 'ADMIN',
        identityStatus: 'VERIFIED',
        sessionVerified: true,
        actorId: 'admin',
        actorName: 'Admin',
      };
      next();
    });
    mountEntityAndStateRoutes(app, {
      dbState,
      auditFile: '',
      persistState: fakePersistState,
    });

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;

    // Fire Request A (will fail after 45ms and roll back) and Request B (arrives 5ms later and succeeds) concurrently
    const reqAPromise = sendHttpRequest({
      port,
      method: 'POST',
      path: '/api/gmao/machines',
      body: { id: 'M-FAIL-A', code: 'M-FAIL-A', designation: 'Should Roll Back' },
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const reqBPromise = sendHttpRequest({
      port,
      method: 'POST',
      path: '/api/gmao/machines',
      body: { id: 'M-OK-B', code: 'M-OK-B', designation: 'Must Survive' },
    });

    const [resA, resB] = await Promise.all([reqAPromise, reqBPromise]);

    expect(resA.status).toBe(500);
    expect(resA.json?.code).toBe('PERSISTENCE_FAILED');
    expect(resB.status).toBe(201);

    const machineIds = (dbState.machines as Array<{ id: string }>).map((m) => m.id);
    expect(machineIds).toContain('M-INIT');
    expect(machineIds).toContain('M-OK-B');
    expect(machineIds).not.toContain('M-FAIL-A');
  });
});
