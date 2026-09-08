const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SUPPORT_CANCEL_BUTTON_ID,
    SUPPORT_CLOSE_BUTTON_ID,
    SUPPORT_DETAILS_FIELD_IDS,
    SUPPORT_PROJECTS,
    buildCloseButtonComponents,
    buildSupportConfirmationComponents,
    buildSupportDetailsModal,
    buildSupportPanelComponents,
    buildTicketName,
    buildTicketTopic,
    getSupportDetailsFields,
    parseSupportButtonId,
    parseSupportConfirmationButtonId,
    parseSupportDetailsModalId,
    parseTicketTopic,
} = require('../utils/support');


test('support panel exposes one button for every supported project', () => {
    const [row] = buildSupportPanelComponents();
    const buttons = row.toJSON().components;

    assert.deepEqual(
        buttons.map(button => button.custom_id),
        Object.keys(SUPPORT_PROJECTS).map(project => `support:start:${project}`),
    );
    assert.deepEqual(
        buttons.map(button => button.label),
        ['🌙 Get Noctalia help', '🌘 Get Umbriel help', '🙌 Get Greeter help', '📦 Get Other help'],
    );
    assert.equal(buttons.length, 4);
});

test('support button IDs reject unrelated and unknown buttons', () => {
    assert.equal(parseSupportButtonId('support:start:noctalia'), 'noctalia');
    assert.equal(parseSupportButtonId('support:start:unknown'), null);
    assert.equal(parseSupportButtonId('other:button'), null);
});

test('project selection requires explicit confirmation', () => {
    assert.equal(parseSupportConfirmationButtonId('support:confirm:noctalia'), 'noctalia');
    assert.equal(parseSupportConfirmationButtonId('support:confirm:unknown'), null);

    const [row] = buildSupportConfirmationComponents('noctalia');
    const buttons = row.toJSON().components;
    assert.equal(buttons[0].custom_id, 'support:confirm:noctalia');
    assert.equal(buttons[0].label, 'Open Noctalia support session');
    assert.equal(buttons[1].custom_id, SUPPORT_CANCEL_BUTTON_ID);
});

test('support details modals collect project-specific system information', () => {
    const noctaliaModal = buildSupportDetailsModal('noctalia').toJSON();
    const noctaliaInputs = noctaliaModal.components.map(row => row.components[0]);

    assert.equal(noctaliaModal.custom_id, 'support:details:noctalia');
    assert.equal(parseSupportDetailsModalId(noctaliaModal.custom_id), 'noctalia');
    assert.deepEqual(
        noctaliaInputs.map(input => input.custom_id),
        [
            SUPPORT_DETAILS_FIELD_IDS.problem,
            SUPPORT_DETAILS_FIELD_IDS.version,
            SUPPORT_DETAILS_FIELD_IDS.distro,
            SUPPORT_DETAILS_FIELD_IDS.graphics,
        ],
    );
    assert.equal(noctaliaInputs.every(input => input.required), true);

    const umbrielModal = buildSupportDetailsModal('umbriel').toJSON();
    const umbrielInputs = umbrielModal.components.map(row => row.components[0]);
    assert.equal(umbrielInputs[3].label, 'GPU');
    assert.equal(getSupportDetailsFields('umbriel', {
        problem: 'Umbriel is not responding.',
        version: '0.5.0',
        distro: 'Fedora 42',
        graphics: 'AMD Radeon 780M',
    })[3].name, 'GPU');

    const otherModal = buildSupportDetailsModal('other').toJSON();
    const otherInputs = otherModal.components.map(row => row.components[0]);
    assert.deepEqual(
        otherInputs.map(input => input.custom_id),
        [
            SUPPORT_DETAILS_FIELD_IDS.problem,
            SUPPORT_DETAILS_FIELD_IDS.component,
            SUPPORT_DETAILS_FIELD_IDS.system,
        ],
    );
    assert.equal(otherInputs[2].required, false);
    assert.equal(parseSupportDetailsModalId('support:details:unknown'), null);
});

test('support details fields omit optional Other system information', () => {
    assert.deepEqual(getSupportDetailsFields('other', {
        problem: 'I need help with a service.',
        component: 'A custom integration',
        system: '',
    }), [
        {
            name: 'What do you need help with?',
            value: 'I need help with a service.',
            inline: false,
        },
        {
            name: 'Application or component',
            value: 'A custom integration',
            inline: false,
        },
        {
            name: 'System details',
            value: 'Not provided',
            inline: false,
        },
    ]);
});

test('ticket metadata round-trips and rejects malformed topics', () => {
    const topic = buildTicketTopic('123456789012345678', 'umbriel');

    assert.deepEqual(parseTicketTopic(topic), {
        userId: '123456789012345678',
        projectKey: 'umbriel',
    });
    assert.equal(parseTicketTopic('talia-support-ticket:v1:not-a-user:umbriel'), null);
    assert.equal(parseTicketTopic('ordinary channel topic'), null);
});

test('ticket names are Discord-safe and bounded', () => {
    const name = buildTicketName('greeter', 'Élodie Example / a very long username '.repeat(5));

    assert.match(name, /^support-greeter-[a-z0-9-]+$/);
    assert.ok(name.length <= 100);
});

test('close action uses a distinct destructive button', () => {
    const [row] = buildCloseButtonComponents();
    assert.equal(row.toJSON().components[0].custom_id, SUPPORT_CLOSE_BUTTON_ID);
});
