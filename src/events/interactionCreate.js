const { Events } = require('discord.js');
const { handleInteraction } = require('../utils/interactionHandler');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        try {
            await handleInteraction(interaction.client, interaction);
        } catch (error) {
            console.error('Error handling interaction:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error processing your command.',
                    ephemeral: true
                });
            } else if (!interaction.replied) {
                await interaction.editReply({
                    content: 'There was an error processing your command.'
                });
            }
        }
    },
};