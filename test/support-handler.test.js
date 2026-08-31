const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { setupSupportHandler } = require('../handlers/supportHandler');
const { buildTicketTopic } = require('../utils/support');

class FakeCollection extends Map {
    find(predicate) {
        return [...this.values()].find(predicate);
    }
}

function createInteraction(overrides = {}) {
    const interaction = {
        customId: 'support:start:noctalia',
        user: {
            id: '123456789012345678',
            username: 'Test User',
            tag: 'Test User#0001',
            toString: () => '<@123456789012345678>',
        },
        guild: null,
        client: { user: { id: '999999999999999999' } },
        channel: null,
        isButton: () => true,
        inGuild: () => true,
        deferReply: async () => {},
        editReply: async payload => { interaction.editedReply = payload; },
        reply: async payload => { interaction.replyPayload = payload; },
        followUp: async payload => { interaction.followUpPayload = payload; },
        ...overrides,
    };
    return interaction;
}

function createClient() {
    const client = {
        user: { id: '999999999999999999' },
        on(event, listener) {
            assert.equal(event, 'interactionCreate');
            this.interactionHandler = listener;
        },
    };
    setupSupportHandler(client);
    return client;
}

test('support button creates a private channel with owner and staff access', async () => {
    const staffRole = { id: 'staff-role', name: 'Moonwarden', toString: () => '<@&staff-role>' };
    const created = [];
    const sentMessages = [];
    const ticketChannel = {
        id: 'ticket-channel',
        send: async payload => { sentMessages.push(payload); },
        delete: async () => {},
        toString: () => '<#ticket-channel>',
    };
    const guild = {
        id: 'guild-id',
        roles: {
            everyone: { id: 'everyone-role' },
            cache: new FakeCollection([['staff-role', staffRole]]),
        },
        members: { me: { id: '999999999999999999' } },
        channels: {
            cache: new FakeCollection(),
            create: async options => { created.push(options); return ticketChannel; },
        },
    };
    const panelInteraction = createInteraction({ guild });
    const client = createClient();

    await client.interactionHandler(panelInteraction);
    assert.match(panelInteraction.replyPayload.embeds[0].data.title, /Open .*Noctalia support session/);
    assert.equal(created.length, 0);

    const confirmationInteraction = createInteraction({
        customId: 'support:confirm:noctalia',
        guild,
    });
    await client.interactionHandler(confirmationInteraction);

    assert.equal(created.length, 1);
    assert.equal(created[0].type, ChannelType.GuildText);
    assert.equal(created[0].topic, buildTicketTopic(confirmationInteraction.user.id, 'noctalia'));
    assert.deepEqual(created[0].permissionOverwrites[0].deny, [PermissionFlagsBits.ViewChannel]);
    assert.equal(created[0].permissionOverwrites.some(overwrite => overwrite.id === staffRole.id), true);
    assert.match(confirmationInteraction.editedReply.content, /private Noctalia support session is ready/);
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[0].content, 'Support team: <@&staff-role>');
    assert.equal(sentMessages[0].flags, MessageFlags.SuppressNotifications);
    assert.deepEqual(sentMessages[0].allowedMentions.roles, [staffRole.id]);
    assert.equal(sentMessages[1].content, '<@123456789012345678>');
    assert.equal(sentMessages[1].flags, undefined);
    assert.deepEqual(sentMessages[1].allowedMentions.users, [confirmationInteraction.user.id]);
});

test('ticket owner can close and delete the support channel', async () => {
    let deleted = false;
    const ticketChannel = {
        topic: buildTicketTopic('123456789012345678', 'other'),
        delete: async () => { deleted = true; },
    };
    const interaction = createInteraction({
        customId: 'support:close',
        channel: ticketChannel,
        guild: { id: 'guild-id', members: {}, roles: {} },
        member: {
            permissions: { has: () => false },
            roles: { cache: new FakeCollection() },
        },
    });
    const client = createClient();

    await client.interactionHandler(interaction);

    assert.match(interaction.replyPayload.content, /Closing this support session/);
    assert.equal(deleted, true);
});
