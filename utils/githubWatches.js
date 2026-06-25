const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/githubWatches.json');

async function ensureDataDirectory() {
    const dataDir = path.dirname(DATA_FILE);
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

async function loadData() {
    await ensureDataDirectory();

    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        if (error instanceof SyntaxError) {
            console.warn('Warning: githubWatches.json is corrupted. Starting fresh.');
            return {};
        }
        throw error;
    }
}

async function saveData(data) {
    await ensureDataDirectory();
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function getWatches() {
    return await loadData();
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function addWatch(guildId, channelId, owner, repo, branch, createdBy) {
    const data = await loadData();

    if (!data[guildId]) {
        data[guildId] = [];
    }

    const watch = {
        id: generateId(),
        channelId,
        owner,
        repo,
        branch,
        createdBy,
        createdAt: new Date().toISOString(),
    };

    data[guildId].push(watch);

    await saveData(data);
    return watch.id;
}

async function removeWatch(guildId, watchId) {
    const data = await loadData();

    if (!data[guildId]) return;

    data[guildId] = data[guildId].filter(w => w.id !== watchId);

    if (data[guildId].length === 0) {
        delete data[guildId];
    }

    await saveData(data);
}

async function removeChannelWatches(guildId, channelId, owner, repo) {
    const data = await loadData();
    if (!data[guildId]) return;

    data[guildId] = data[guildId].filter(w =>
        !(w.channelId === channelId &&
          (!owner || w.owner === owner) &&
          (!repo || w.repo === repo))
    );

    if (data[guildId].length === 0) {
        delete data[guildId];
    }

    await saveData(data);
}

async function getGuildWatches(guildId) {
    const data = await loadData();
    return data[guildId] || [];
}

module.exports = {
    getWatches,
    addWatch,
    removeWatch,
    removeChannelWatches,
    getGuildWatches,
};
