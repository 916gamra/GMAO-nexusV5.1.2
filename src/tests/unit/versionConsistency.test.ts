import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_VERSION,
  APP_RELEASE_TAG,
  APP_NAME,
  APP_PACKAGE_NAME,
} from '../../config/appVersion';
import { swaggerSpec } from '../../config/swaggerConfig';
import { AutoBackupService } from '../../core/backup/AutoBackupService';

describe('Release Governance & Version Consistency (5.1.2 / GMAO-nexusV5.1.2)', () => {
  const rootDir = process.cwd();

  it('keeps package.json, package-lock.json, OpenAPI, Service Worker, and AutoBackupService aligned with APP_VERSION', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
    const swText = fs.readFileSync(path.join(rootDir, 'public/service-worker.js'), 'utf8');
    const viteConfigText = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');

    expect(APP_VERSION).toBe('5.1.2');
    expect(APP_RELEASE_TAG).toBe('GMAO-nexusV5.1.2');
    expect(pkg.name).toBe(APP_PACKAGE_NAME);
    expect(pkg.version).toBe(APP_VERSION);
    expect(lock.name).toBe(APP_PACKAGE_NAME);
    expect(lock.version).toBe(APP_VERSION);
    expect(lock.packages?.['']?.version).toBe(APP_VERSION);

    expect(swText).toContain(`gmao-nexus-v${APP_VERSION}`);
    expect(swText).toContain(`gmao-nexus-assets-v${APP_VERSION}`);
    expect(swText).not.toContain('DATA_CACHE_NAME');
    expect(swText).not.toContain('networkFirstWithCacheFallback');

    expect(viteConfigText).not.toContain('cdn.tailwindcss.com');
    expect(viteConfigText).not.toContain('cdn.jsdelivr.net');
    expect(viteConfigText).not.toContain('gmao-api-cache');
    expect(viteConfigText).toContain("handler: 'NetworkOnly'");

    expect((swaggerSpec as any).info.version).toBe(APP_VERSION);

    const backupPayload = AutoBackupService.buildOperationalSnapshotPayload('full');
    expect(backupPayload.version).toBe(APP_VERSION);
    expect(backupPayload.app).toBe(APP_NAME);
  });

  it('includes international standard legal, security, governance, and release automation files', () => {
    const requiredFiles = [
      'LICENSE',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'CODE_OF_CONDUCT.md',
      'CHANGELOG.md',
      '.github/workflows/release.yml',
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.join(rootDir, relPath);
      expect(fs.existsSync(fullPath), `${relPath} must exist`).toBe(true);
      expect(fs.readFileSync(fullPath, 'utf8').trim().length).toBeGreaterThan(100);
    }

    const licenseText = fs.readFileSync(path.join(rootDir, 'LICENSE'), 'utf8');
    expect(licenseText).toContain('MIT License');

    const changelogText = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
    expect(changelogText).toContain(`[${APP_VERSION}]`);
    expect(changelogText).toContain(APP_RELEASE_TAG);

    const readmeText = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
    expect(readmeText).toContain(APP_VERSION);
    expect(readmeText).toContain(APP_RELEASE_TAG);
  });
});
