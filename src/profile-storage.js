// Extracted from connected-web-aws packages/cweb: encrypted profile format v2.
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import childProcess from "child_process";
const PROFILE_ENVELOPE_VERSION = 2;
function isWsl() {
    try {
        return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
    }
    catch {
        return false;
    }
}
function windowsProtectedProfileKey() {
    if (process.platform !== 'win32' && !isWsl())
        return null;
    const script = [
        '$ErrorActionPreference = "Stop"',
        '$root = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "ConnectedWeb"',
        '$path = Join-Path $root "cweb-profile-key.dpapi"',
        'if (Test-Path -LiteralPath $path) {',
        '  $protected = [IO.File]::ReadAllBytes($path)',
        '  $key = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
        '} else {',
        '  $key = New-Object byte[] 32',
        '  [Security.Cryptography.RandomNumberGenerator]::Fill($key)',
        '  $protected = [Security.Cryptography.ProtectedData]::Protect($key, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
        '  [IO.Directory]::CreateDirectory($root) | Out-Null',
        '  [IO.File]::WriteAllBytes($path, $protected)',
        '}',
        '[Convert]::ToBase64String($key)'
    ].join('\n');
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
    const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], { encoding: 'utf8' });
    if (result.status !== 0)
        return null;
    const key = Buffer.from(String(result.stdout || '').trim(), 'base64');
    return key.length === 32 ? key : null;
}
function localProfileKeyPath() {
    return path.join(os.homedir(), '.cweb', 'profile.key');
}
function profileEncryptionKey() {
    const protectedKey = windowsProtectedProfileKey();
    if (protectedKey)
        return protectedKey;
    // This fallback preserves support on headless Linux hosts. Its permissions
    // protect against other OS users, while Windows/WSL uses DPAPI so a copied
    // profile cannot be decrypted by another local tool.
    const keyPath = localProfileKeyPath();
    if (fs.existsSync(keyPath)) {
        const key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64');
        if (key.length === 32)
            return key;
    }
    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(keyPath, 0o600);
    return key;
}
function encryptProfile(payload) {
    const key = profileEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('connected-web:cweb-profile:v2', 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return {
        version: PROFILE_ENVELOPE_VERSION,
        encryption: { algorithm: 'aes-256-gcm', keyProvider: (process.platform === 'win32' || isWsl()) ? 'windows-dpapi' : 'local-file' },
        iv: iv.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tag: cipher.getAuthTag().toString('base64')
    };
}
function decryptProfile(envelope) {
    const iv = Buffer.from(String(envelope.iv || ''), 'base64');
    const ciphertext = Buffer.from(String(envelope.ciphertext || ''), 'base64');
    const tag = Buffer.from(String(envelope.tag || ''), 'base64');
    if (iv.length !== 12 || ciphertext.length === 0 || tag.length !== 16)
        throw new Error('Invalid encrypted cweb profile');
    const decipher = crypto.createDecipheriv('aes-256-gcm', profileEncryptionKey(), iv);
    decipher.setAAD(Buffer.from('connected-web:cweb-profile:v2', 'utf8'));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}
export function decodeJwtPayload(token) {
    try {
        const payloadSegment = token.split('.')[1];
        const json = Buffer.from(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        return JSON.parse(json);
    }
    catch {
        return {};
    }
}
export function resolveUserPoolIdFromIssuer(issuer) {
    const raw = typeof issuer === 'string' ? issuer.trim() : '';
    if (raw === '')
        return '';
    const match = raw.match(/\/([a-z]{2}-[a-z]+-\d+_[A-Za-z0-9]+)$/i);
    return match?.[1] ?? '';
}
export function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}
export function secondsToDuration(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hours > 0)
        return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0)
        return `${minutes}m ${secs}s`;
    return `${secs}s`;
}
export function profileInfoPath(profileAliasToAccountName, profile) {
    const accountName = profileAliasToAccountName(profile);
    return path.join(os.homedir(), '.cweb', 'profiles', accountName, 'info.json');
}
export function loadProfileInfo(profileAliasToAccountName, profile) {
    const filepath = profileInfoPath(profileAliasToAccountName, profile);
    if (!fs.existsSync(filepath))
        return {};
    const stored = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    return stored?.version === PROFILE_ENVELOPE_VERSION && stored?.encryption?.algorithm === 'aes-256-gcm'
        ? decryptProfile(stored)
        : stored;
}
export function saveProfileInfo(profileAliasToAccountName, profile, payload) {
    const filepath = profileInfoPath(profileAliasToAccountName, profile);
    fs.mkdirSync(path.dirname(filepath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(filepath), 0o700);
    const temporaryPath = `${filepath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(encryptProfile(payload), null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, filepath);
    fs.chmodSync(filepath, 0o600);
}
export function clearProfileInfo(profileAliasToAccountName, profile) {
    const filepath = profileInfoPath(profileAliasToAccountName, profile);
    if (!fs.existsSync(filepath))
        return;
    fs.unlinkSync(filepath);
}
export function isTokenValid (token, expiresAt) {
    if (typeof token !== 'string' || token.trim() === '') return false;
    const expiry = Number(expiresAt || 0);
    return Number.isFinite(expiry) && expiry > nowEpochSeconds() + 30;
}
