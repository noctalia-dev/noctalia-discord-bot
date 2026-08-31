const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SUPPORT_CLOSE_BUTTON_ID,
    SUPPORT_PROJECTS,
    buildCloseButtonComponents,
    buildSupportPanelComponents,
    buildTicketName,
    buildTicketTopic,
    parseSupportButtonId,
    parseTicketTopic,
} = require('../utils/support');


test('support panel exposes one button for every supported project', () => {
    const [row] = buildSupportPanelComponents();
    const buttons = row.toJSON().components;

    assert.deepEqual(
        buttons.map(button => button.custom_id),
        Object.keys(SUPPORT_PROJECTS).map(project => `support:start:${project}`),
    );
    assert.equal(buttons.length, 4);
});

test('support button IDs reject unrelated and unknown buttons', () => {
    assert.equal(parseSupportButtonId('support:start:noctalia'), 'noctalia');
    assert.equal(parseSupportButtonId('support:start:unknown'), null);
    assert.equal(parseSupportButtonId('other:button'), null);
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
