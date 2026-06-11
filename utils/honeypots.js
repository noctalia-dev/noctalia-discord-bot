const fs = require('fs').promises;
const path = require('path');

const HONEYPOTS_FILE = path.join(__dirname, '../data/honeypots.json');

async function ensureDataDirectory() {
    const dataDir = path.dirname(HONEYPOTS_FILE);
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

async function loadHoneypots() {
    await ensureDataDirectory();

    try {
        const data = await fs.readFile(HONEYPOTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        if (error instanceof SyntaxError) {
            console.warn('Warning: honeypots.json is corrupted. Starting fresh.');
            return {};
        }
        throw error;
    }
}

async function saveHoneypotsData(data) {
    await ensureDataDirectory();
    await fs.writeFile(HONEYPOTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function getHoneypots() {
    return await loadHoneypots();
}

async function addHoneypotChannel(guildId, channelId, createdBy) {
    const data = await loadHoneypots();

    if (!data[guildId]) {
        data[guildId] = { channels: {} };
    }
    if (!data[guildId].channels) {
        data[guildId].channels = {};
    }

    data[guildId].channels[channelId] = {
        enabled: true,
        createdBy,
        createdAt: new Date().toISOString(),
    };

    await saveHoneypotsData(data);
}

async function removeHoneypotChannel(guildId, channelId) {
    const data = await loadHoneypots();

    if (data[guildId]?.channels?.[channelId]) {
        delete data[guildId].channels[channelId];

        if (Object.keys(data[guildId].channels).length === 0) {
            delete data[guildId];
        }
    }

    await saveHoneypotsData(data);
}

async function isHoneypotChannel(guildId, channelId) {
    const data = await loadHoneypots();
    return data[guildId]?.channels?.[channelId]?.enabled === true;
}

async function getGuildHoneypots(guildId) {
    const data = await loadHoneypots();
    return data[guildId]?.channels || {};
}

module.exports = {
    getHoneypots,
    addHoneypotChannel,
    removeHoneypotChannel,
    isHoneypotChannel,
    getGuildHoneypots,
};
