const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const SUPPORT_BUTTON_PREFIX = 'support:start:';
const SUPPORT_CLOSE_BUTTON_ID = 'support:close';
const SUPPORT_TICKET_TOPIC_PREFIX = 'talia-support-ticket:v1';

const SUPPORT_PROJECTS = Object.freeze({
    noctalia: Object.freeze({
        key: 'noctalia',
        label: 'Noctalia',
        emoji: '🌙',
    }),
    umbriel: Object.freeze({
        key: 'umbriel',
        label: 'Umbriel',
        emoji: '🌘',
    }),
    greeter: Object.freeze({
        key: 'greeter',
        label: 'Greeter',
        emoji: '🙌',
    }),
    other: Object.freeze({
        key: 'other',
        label: 'Other',
        emoji: '📦',
    }),
});

function getSupportProject(projectKey) {
    return SUPPORT_PROJECTS[projectKey] || null;
}

function getSupportButtonId(projectKey) {
    if (!getSupportProject(projectKey)) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    return `${SUPPORT_BUTTON_PREFIX}${projectKey}`;
}

function parseSupportButtonId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(SUPPORT_BUTTON_PREFIX)) {
        return null;
    }

    const projectKey = customId.slice(SUPPORT_BUTTON_PREFIX.length);
    return getSupportProject(projectKey) ? projectKey : null;
}

function buildSupportPanelComponents() {
    const row = new ActionRowBuilder();

    for (const project of Object.values(SUPPORT_PROJECTS)) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(getSupportButtonId(project.key))
                .setLabel(`${project.emoji} ${project.label}`)
                .setStyle(ButtonStyle.Secondary),
        );
    }

    return [row];
}

function buildCloseButtonComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(SUPPORT_CLOSE_BUTTON_ID)
                .setLabel('Close support session')
                .setStyle(ButtonStyle.Danger),
        ),
    ];
}

function buildTicketTopic(userId, projectKey) {
    if (!getSupportProject(projectKey)) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    return `${SUPPORT_TICKET_TOPIC_PREFIX}:${userId}:${projectKey}`;
}

function parseTicketTopic(topic) {
    if (typeof topic !== 'string' || !topic.startsWith(`${SUPPORT_TICKET_TOPIC_PREFIX}:`)) {
        return null;
    }

    const parts = topic.split(':');
    if (parts.length !== 4) return null;

    const [, , userId, projectKey] = parts;
    if (!/^\d+$/.test(userId) || !getSupportProject(projectKey)) return null;

    return { userId, projectKey };
}

function buildTicketName(projectKey, username) {
    const project = getSupportProject(projectKey);
    if (!project) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    const userPart = String(username || 'user')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70) || 'user';

    return `support-${project.key}-${userPart}`.slice(0, 100);
}

module.exports = {
    SUPPORT_BUTTON_PREFIX,
    SUPPORT_CLOSE_BUTTON_ID,
    SUPPORT_PROJECTS,
    buildCloseButtonComponents,
    buildSupportPanelComponents,
    buildTicketName,
    buildTicketTopic,
    getSupportProject,
    parseSupportButtonId,
    parseTicketTopic,
};
