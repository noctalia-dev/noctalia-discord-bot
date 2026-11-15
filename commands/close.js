const { SlashCommandBuilder } = require('discord.js');
const { handleTicketClose } = require('../handlers/supportHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close the current support session')
        .setDMPermission(false),

    async execute(interaction) {
        await handleTicketClose(interaction);
    },
};
