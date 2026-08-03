const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const resources = require('../config/resources');

const RULES_FILE = path.join(__dirname, '../data/rules.md');
const REACT_SUFFIX = '\n\n*React below to get your roles!*';

function readRulesBody() {
    return fs.readFileSync(RULES_FILE, 'utf8').replace(/\s+$/, '');
}

/**
 * Compare data/rules.md against the live rules message and edit it if they differ.
 * @param {Client} client - Discord.js client
 */
async function syncRulesMessage(client) {
    const { messageId, channelId } = resources.rules;

    let body;
    try {
        body = readRulesBody();
    } catch (error) {
        console.error('[rulesSync] Could not read data/rules.md:', error.message);
        return;
    }

    const expectedDescription = `${body}${REACT_SUFFIX}`;

    try {
        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);

        const current = message.embeds?.[0];
        if (!current) {
            console.warn('[rulesSync] Rules message has no embed to update.');
            return;
        }

        if (current.description === expectedDescription) {
            return; // Already up to date
        }

        const updated = EmbedBuilder.from(current).setDescription(expectedDescription);
        await message.edit({ embeds: [updated] });
        console.log('[rulesSync] Rules message updated from data/rules.md');
    } catch (error) {
        console.error('[rulesSync] Failed to sync rules message:', error.message);
    }
}

/**
 * Watch data/rules.md and re-sync the rules message whenever it changes on disk.
 * @param {Client} client - Discord.js client
 */
function setupRulesFileWatcher(client) {
    const dataDir = path.dirname(RULES_FILE);
    const filename = path.basename(RULES_FILE);
    let debounceTimer = null;

    fs.watch(dataDir, (eventType, changedFile) => {
        if (changedFile !== filename) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            syncRulesMessage(client);
        }, 500);
    });

    console.log('[rulesSync] Watching data/rules.md for changes');
}

module.exports = { syncRulesMessage, setupRulesFileWatcher };
