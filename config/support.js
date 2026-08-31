function parseList(value) {
    return (value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

module.exports = {
    // Role IDs are stable across renames and should be preferred in production.
    staffRoleIds: parseList(process.env.SUPPORT_STAFF_ROLE_IDS || process.env.SUPPORT_STAFF_ROLE_ID),
    // Names make initial setup easier; IDs take precedence when both are set.
    staffRoleNames: parseList(process.env.SUPPORT_STAFF_ROLE_NAMES || 'Moonwarden,Nightwatch,Owlkeeper'),
    categoryId: process.env.SUPPORT_CATEGORY_ID || null,
    panelChannelId: process.env.SUPPORT_PANEL_CHANNEL_ID || null,
};
