module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Command error:', error);
            try {
                const reply = { content: 'Something went wrong. Please try again.', ephemeral: true };
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.reply(reply);
                } else {
                    await interaction.followUp(reply).catch(() => {});
                }
            } catch (e) {
                console.error('Error handling command error:', e);
            }
        }
    });
};