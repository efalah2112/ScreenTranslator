'use strict';

const crypto = require('crypto');
const fs = require('fs');

const PREFIX = 'enc:v1:';

function getKey() {
    const raw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!raw) return null;

    let key;
    if (/^[a-f0-9]{64}$/i.test(raw)) {
        key = Buffer.from(raw, 'hex');
    } else {
        key = Buffer.from(raw, 'base64');
    }

    if (key.length !== 32) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte key (64 hex characters or base64).');
    }
    return key;
}

function isConfigured() {
    return Boolean(getKey());
}

function encryptToken(token) {
    if (typeof token !== 'string' || !token.trim()) {
        throw new Error('A non-empty token is required.');
    }
    const key = getKey();
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is not configured.');

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return PREFIX + [
        iv.toString('base64'),
        tag.toString('base64'),
        encrypted.toString('base64')
    ].join(':');
}

function decryptToken(value) {
    if (typeof value !== 'string') throw new Error('Invalid encrypted token value.');
    if (!value.startsWith(PREFIX)) return value; // Legacy plaintext value during migration.

    const key = getKey();
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to decrypt stored bot tokens.');

    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted token format.');

    const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function saveConfig(config, filePath = './config.json') {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
}

function loadTokens(config, filePath = './config.json') {
    if (Array.isArray(config.encryptedTokens)) {
        return config.encryptedTokens.map(decryptToken);
    }

    const legacyTokens = Array.isArray(config.tokens) ? config.tokens : [];
    if (!getKey()) {
        if (legacyTokens.length) {
            console.warn('[Security] Bot tokens are still in legacy plaintext storage. Set TOKEN_ENCRYPTION_KEY to migrate them.');
        }
        return legacyTokens;
    }

    config.encryptedTokens = legacyTokens.map(encryptToken);
    delete config.tokens;
    saveConfig(config, filePath);
    console.log('[Security] Migrated bot tokens to encrypted storage.');
    return legacyTokens;
}

function writeTokens(config, tokens, filePath = './config.json') {
    if (!getKey()) throw new Error('Set TOKEN_ENCRYPTION_KEY in the hosting environment before changing bot tokens.');
    config.encryptedTokens = [...new Set(tokens)].map(encryptToken);
    delete config.tokens;
    saveConfig(config, filePath);
}

function addToken(token, filePath = './config.json') {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const tokens = loadTokens(config, filePath);
    if (tokens.includes(token)) return false;
    writeTokens(config, [...tokens, token], filePath);
    return true;
}

function removeToken(token, filePath = './config.json') {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const tokens = loadTokens(config, filePath);
    if (!tokens.includes(token)) return false;
    writeTokens(config, tokens.filter(value => value !== token), filePath);
    return true;
}

module.exports = {
    isConfigured,
    encryptToken,
    decryptToken,
    loadTokens,
    addToken,
    removeToken
};
