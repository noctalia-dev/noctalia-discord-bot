const fs = require('fs').promises;
const path = require('path');

const LOGGING_FILE = path.join(__dirname, '../data/logging.json');

async function loadLoggingData() {
    try {
        const data = await fs.readFile(LOGGING_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        if (error instanceof SyntaxError) {
            console.warn('Warning: logging.json is corrupted. Starting with no logging configuration.');
            return {};
        }
        throw error;
    }
}

async function saveLoggingData(data) {
    await fs.mkdir(path.dirname(LOGGING_FILE), { recursive: true });
    await fs.writeFile(LOGGING_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function setLoggingChannel(guildId, type, channelId, configuredBy) {
    const data = await loadLoggingData();
    data[guildId] = {
        ...data[guildId],
        [`${type}ChannelId`]: channelId,
        configuredBy,
        configuredAt: new Date().toISOString(),
    };
    await saveLoggingData(data);
}

async function removeLoggingChannel(guildId, type) {
    const data = await loadLoggingData();
    if (!data[guildId]) return;

    delete data[guildId][`${type}ChannelId`];
    if (!data[guildId].moderationChannelId && !data[guildId].activityChannelId) {
        delete data[guildId];
    }
    await saveLoggingData(data);
}

async function getLoggingChannelId(guildId, type) {
    const data = await loadLoggingData();
    return data[guildId]?.[`${type}ChannelId`] || null;
}

async function getLoggingChannels(guildId) {
    const data = await loadLoggingData();
    return {
        moderation: data[guildId]?.moderationChannelId || null,
        activity: data[guildId]?.activityChannelId || null,
    };
}

module.exports = {
    setLoggingChannel,
    removeLoggingChannel,
    getLoggingChannelId,
    getLoggingChannels,
};
