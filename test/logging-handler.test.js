const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
    AuditLogEvent,
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
} = require('discord.js');

const GUILD_ID = '900000000000000001';
const CHANNEL_ID = '900000000000000002';
const LOG_CHANNEL_ID = '900000000000000003';
const MESSAGE_ID = '900000000000000004';
const AUTHOR = {
    id: '900000000000000005',
    username: 'Human',
    discriminator: '0',
    bot: false,
};

// Stub configuration and the audit-log delay without touching saved guild data
// or changing timers used by the real Discord.js client.
const handlerPath = path.join(__dirname, '../handlers/loggingHandler.js');
const handlerModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(handlerPath, 'utf8'), {
    module: handlerModule,
    require(specifier) {
        if (specifier === '../utils/logging') {
            return { getLoggingChannelId: async () => LOG_CHANNEL_ID };
        }
        return require(specifier);
    },
    setTimeout: callback => callback(),
    console,
}, { filename: handlerPath });
const { setupLoggingHandler } = handlerModule.exports;

function createHarness(t) {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });
    client.user = client.users._add({
        id: '900000000000000006',
        username: 'Talia',
        discriminator: '0',
        bot: true,
    });
    const guild = client.guilds._add({
        id: GUILD_ID,
        name: 'Logging tests',
        unavailable: false,
        channels: [
            { id: CHANNEL_ID, name: 'plugins', type: 0, permission_overwrites: [] },
            { id: LOG_CHANNEL_ID, name: 'logs', type: 0, permission_overwrites: [] },
        ],
    });
    const channel = client.channels.cache.get(CHANNEL_ID);
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    const sent = [];
    const auditRequests = [];
    const auditEntries = new Collection();
    const restRequests = [];
    const pendingDeletes = [];

    logChannel.send = async payload => { sent.push(payload); };
    guild.fetchAuditLogs = async options => {
        auditRequests.push(options);
        return { entries: auditEntries };
    };
    client.rest.get = async route => {
        restRequests.push(route);
        throw new Error('A deleted message cannot be fetched');
    };

    setupLoggingHandler(client);
    const [deleteListener] = client.listeners('messageDelete');
    client.removeListener('messageDelete', deleteListener);
    client.on('messageDelete', message => {
        pendingDeletes.push(deleteListener(message));
    });
    t.after(() => client.destroy());

    function raw(type, data) {
        client.emit('raw', { t: type, d: data });
    }

    function dispatch(type, data) {
        // The real gateway emits raw before processing the packet's action.
        raw(type, data);
        if (type === 'MESSAGE_CREATE') return client.actions.MessageCreate.handle(data);
        if (type === 'MESSAGE_UPDATE') return client.actions.MessageUpdate.handle(data);
        if (type === 'MESSAGE_DELETE') return client.actions.MessageDelete.handle(data);
        throw new Error(`Unsupported test packet: ${type}`);
    }

    return {
        client,
        guild,
        channel,
        sent,
        auditRequests,
        auditEntries,
        restRequests,
        raw,
        dispatch,
        deleteMessage: deleteListener,
        finishDeletes: async () => Promise.all(pendingDeletes),
    };
}

function payload(overrides = {}) {
    return {
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
        author: AUTHOR,
        content: 'Original message',
        type: 0,
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

function deletion(harness, overrides = {}) {
    return {
        id: MESSAGE_ID,
        guild: harness.guild,
        channel: harness.channel,
        author: null,
        content: null,
        partial: true,
        async fetch() {
            throw new Error('Deleted-message fetch should never be called');
        },
        ...overrides,
    };
}

function description(harness) {
    assert.equal(harness.sent.length, 1);
    assert.equal(harness.sent[0].embeds[0].data.title, '🗑️ Message Deleted');
    return harness.sent[0].embeds[0].data.description;
}

test('logs author and text after an update arrives before message creation', async t => {
    for (const updateContent of [undefined, 'Edited before creation']) {
        await t.test(updateContent === undefined ? 'authorless update' : 'earlier edit survives creation', async t => {
            const h = createHarness(t);
            const update = {
                id: MESSAGE_ID,
                channel_id: CHANNEL_ID,
                guild_id: GUILD_ID,
                edited_timestamp: new Date().toISOString(),
            };
            if (updateContent !== undefined) update.content = updateContent;

            h.dispatch('MESSAGE_UPDATE', update);
            h.dispatch('MESSAGE_CREATE', payload());

            h.dispatch('MESSAGE_DELETE', {
                id: MESSAGE_ID,
                channel_id: CHANNEL_ID,
                guild_id: GUILD_ID,
            });
            await h.finishDeletes();

            const text = description(h);
            assert.ok(text.includes(`**Author:** Human (${AUTHOR.id})`));
            assert.ok(text.includes(`**Deleted by:** Human (${AUTHOR.id})`));
            assert.ok(text.includes(`**Channel:** <#${CHANNEL_ID}>`));
            assert.ok(text.includes(`**Content:** ${updateContent ?? 'Original message'}`));
            assert.equal(h.restRequests.length, 0, 'do not fetch the deleted partial');
        });
    }
});

test('raw edits retain the author and survive embed-only updates and stale delete objects', async t => {
    for (const content of ['Latest edited text', '']) {
        await t.test(content ? 'edited text' : 'empty edit', async t => {
            const h = createHarness(t);
            h.raw('MESSAGE_CREATE', payload());
            h.raw('MESSAGE_UPDATE', {
                id: MESSAGE_ID,
                channel_id: CHANNEL_ID,
                guild_id: GUILD_ID,
                content,
            });
            h.raw('MESSAGE_UPDATE', {
                id: MESSAGE_ID,
                channel_id: CHANNEL_ID,
                guild_id: GUILD_ID,
                embeds: [],
            });

            let fetchCalls = 0;
            await h.deleteMessage(deletion(h, {
                content: 'Stale message text',
                fetch: async () => { fetchCalls++; },
            }));

            const text = description(h);
            assert.ok(text.includes(`**Author:** Human (${AUTHOR.id})`));
            assert.ok(text.includes(`**Content:** ${content || '*Message content was unavailable*'}`));
            assert.equal(text.includes('Stale message text'), false);
            assert.equal(fetchCalls, 0);
            assert.equal(h.restRequests.length, 0);
        });
    }
});

test('partial bot deletions remain excluded after updates omit the author', async t => {
    const h = createHarness(t);
    h.raw('MESSAGE_CREATE', payload({
        author: { ...AUTHOR, username: 'AnotherBot', bot: true },
    }));
    h.raw('MESSAGE_UPDATE', {
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
        content: 'Edited bot message',
    });

    let fetchCalls = 0;
    await h.deleteMessage(deletion(h, { fetch: async () => { fetchCalls++; } }));

    assert.equal(h.sent.length, 0);
    assert.equal(h.auditRequests.length, 0);
    assert.equal(fetchCalls, 0);
});

test('a full Discord.js message supplies the fallback author, content, and audit actor', async t => {
    const h = createHarness(t);
    const message = h.channel.messages._add(payload({
        author: { ...AUTHOR, discriminator: '1234' },
    }));
    const moderator = { id: '900000000000000007', tag: 'Moderator#5678' };
    h.auditEntries.set('entry', {
        targetId: AUTHOR.id,
        createdTimestamp: Date.now(),
        executor: moderator,
        extra: { channel: { id: CHANNEL_ID } },
    });

    await h.deleteMessage(message);

    const text = description(h);
    assert.ok(text.includes(`**Author:** Human#1234 (${AUTHOR.id})`));
    assert.ok(text.includes(`**Deleted by:** Moderator#5678 (${moderator.id})`));
    assert.ok(text.includes('**Content:** Original message'));
    assert.equal(h.auditRequests.length, 1);
    assert.equal(h.auditRequests[0].type, AuditLogEvent.MessageDelete);
    assert.equal(h.auditRequests[0].limit, 6);
    assert.equal(h.restRequests.length, 0);
});

test('uncached partial deletions log unavailable fields without fetching', async t => {
    const h = createHarness(t);
    let fetchCalls = 0;

    await h.deleteMessage(deletion(h, { fetch: async () => { fetchCalls++; } }));

    const text = description(h);
    assert.ok(text.includes('**Author:** Unknown'));
    assert.ok(text.includes('**Deleted by:** Unknown'));
    assert.ok(text.includes('**Content:** *Message content was unavailable*'));
    assert.equal(h.auditRequests.length, 0);
    assert.equal(fetchCalls, 0);
});

test('message snapshots belong to their own client', async t => {
    const first = createHarness(t);
    const second = createHarness(t);
    first.raw('MESSAGE_CREATE', payload());

    await second.deleteMessage(deletion(second));
    assert.ok(description(second).includes('**Author:** Unknown'));

    await first.deleteMessage(deletion(first));
    assert.ok(description(first).includes(`**Author:** Human (${AUTHOR.id})`));
});
