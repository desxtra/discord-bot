const { handleMusicButton } = require('./musicButton');

async function interactionCreate(interaction, client) {
    if (!interaction.isCommand() && !interaction.isButton()) return;

    try {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            await command.execute(interaction, client);
        } else if (interaction.isButton()) {
            await handleMusicButton(interaction, client);
        }
    } catch (error) {
        console.error('Interaction error:', error);
        
        try {
            const errorMessage = {
                content: 'There was an error executing this command!',
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (interaction.replied) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (e) {
            console.error('Error while handling interaction error:', e);
        }
    }
}

module.exports = { interactionCreate };