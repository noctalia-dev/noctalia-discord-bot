const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const SUPPORT_BUTTON_PREFIX = 'support:start:';
const SUPPORT_CONFIRM_BUTTON_PREFIX = 'support:confirm:';
const SUPPORT_CANCEL_BUTTON_ID = 'support:cancel';
const SUPPORT_CLOSE_BUTTON_ID = 'support:close';
const SUPPORT_DETAILS_MODAL_PREFIX = 'support:details:';
const SUPPORT_DETAILS_FIELD_IDS = Object.freeze({
    problem: 'support-details:problem',
    version: 'support-details:version',
    distro: 'support-details:distro',
    graphics: 'support-details:graphics',
    component: 'support-details:component',
    system: 'support-details:system',
});
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
        issueUrl: 'https://github.com/noctalia-dev/umbriel',
    }),
    greeter: Object.freeze({
        key: 'greeter',
        label: 'Greeter',
        emoji: '🙌',
        issueUrl: 'https://github.com/noctalia-dev/noctalia-greeter',
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
                .setLabel(`${project.emoji} Get ${project.label} help`)
                .setStyle(ButtonStyle.Secondary),
        );
    }

    return [row];
}

function getSupportConfirmationButtonId(projectKey) {
    if (!getSupportProject(projectKey)) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    return `${SUPPORT_CONFIRM_BUTTON_PREFIX}${projectKey}`;
}

function parseSupportConfirmationButtonId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(SUPPORT_CONFIRM_BUTTON_PREFIX)) {
        return null;
    }

    const projectKey = customId.slice(SUPPORT_CONFIRM_BUTTON_PREFIX.length);
    return getSupportProject(projectKey) ? projectKey : null;
}

function getSupportDetailsModalId(projectKey) {
    if (!getSupportProject(projectKey)) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    return `${SUPPORT_DETAILS_MODAL_PREFIX}${projectKey}`;
}

function parseSupportDetailsModalId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(SUPPORT_DETAILS_MODAL_PREFIX)) {
        return null;
    }

    const projectKey = customId.slice(SUPPORT_DETAILS_MODAL_PREFIX.length);
    return getSupportProject(projectKey) ? projectKey : null;
}

function buildSupportDetailsModal(projectKey) {
    const project = getSupportProject(projectKey);
    if (!project) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    const modal = new ModalBuilder()
        .setCustomId(getSupportDetailsModalId(projectKey))
        .setTitle(`${project.label} support details`);

    modal.addComponents(
        buildTextInput(
            SUPPORT_DETAILS_FIELD_IDS.problem,
            'What do you need help with?',
            'Briefly describe the problem or question.',
            true,
            1_000,
        ),
    );

    if (projectKey === 'other') {
        modal.addComponents(
            buildTextInput(
                SUPPORT_DETAILS_FIELD_IDS.component,
                'Application or component',
                'What software, service, or component is involved?',
                true,
                300,
            ),
            buildTextInput(
                SUPPORT_DETAILS_FIELD_IDS.system,
                'System details, if relevant',
                'Distro, GPU, and Wayland compositor. Leave blank if not relevant.',
                false,
                1_000,
            ),
        );
        return modal;
    }

    const graphicsLabel = projectKey === 'umbriel' ? 'GPU' : 'GPU and Wayland compositor';
    const graphicsPlaceholder = projectKey === 'umbriel'
        ? 'e.g. AMD Radeon 780M. Enter "not sure" if unknown.'
        : 'GPU and compositor/window manager. Enter "not sure" if unknown.';

    modal.addComponents(
        buildTextInput(
            SUPPORT_DETAILS_FIELD_IDS.version,
            `${project.label} version`,
            'e.g. 1.4.2. Enter "not sure" if unknown.',
            true,
            300,
        ),
        buildTextInput(
            SUPPORT_DETAILS_FIELD_IDS.distro,
            'Distribution and version',
            'e.g. Fedora 42. Enter "not sure" if unknown.',
            true,
            300,
        ),
        buildTextInput(
            SUPPORT_DETAILS_FIELD_IDS.graphics,
            graphicsLabel,
            graphicsPlaceholder,
            true,
            1_000,
        ),
    );

    return modal;
}

function buildTextInput(customId, label, placeholder, required, maxLength) {
    return new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(placeholder)
            .setRequired(required)
            .setMaxLength(maxLength),
    );
}

function getSupportDetailsFields(projectKey, details) {
    const project = getSupportProject(projectKey);
    if (!project) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    const fields = [
        {
            name: 'What do you need help with?',
            value: details.problem,
            inline: false,
        },
    ];

    if (projectKey === 'other') {
        fields.push(
            {
                name: 'Application or component',
                value: details.component,
                inline: false,
            },
            {
                name: 'System details',
                value: details.system || 'Not provided',
                inline: false,
            },
        );
        return fields;
    }

    fields.push(
        {
            name: `${project.label} version`,
            value: details.version,
            inline: true,
        },
        {
            name: 'Distribution',
            value: details.distro,
            inline: true,
        },
        {
            name: projectKey === 'umbriel' ? 'GPU' : 'GPU and Wayland compositor',
            value: details.graphics,
            inline: false,
        },
    );

    return fields;
}

function buildSupportConfirmationComponents(projectKey) {
    const project = getSupportProject(projectKey);
    if (!project) {
        throw new Error(`Unknown support project: ${projectKey}`);
    }

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(getSupportConfirmationButtonId(projectKey))
                .setLabel(`Open ${project.label} support session`)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(SUPPORT_CANCEL_BUTTON_ID)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
        ),
    ];
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
    SUPPORT_CANCEL_BUTTON_ID,
    SUPPORT_CLOSE_BUTTON_ID,
    SUPPORT_CONFIRM_BUTTON_PREFIX,
    SUPPORT_DETAILS_FIELD_IDS,
    SUPPORT_DETAILS_MODAL_PREFIX,
    SUPPORT_PROJECTS,
    buildCloseButtonComponents,
    buildSupportConfirmationComponents,
    buildSupportDetailsModal,
    buildSupportPanelComponents,
    buildTicketName,
    buildTicketTopic,
    getSupportConfirmationButtonId,
    getSupportDetailsFields,
    getSupportDetailsModalId,
    getSupportProject,
    parseSupportButtonId,
    parseSupportConfirmationButtonId,
    parseSupportDetailsModalId,
    parseTicketTopic,
};
