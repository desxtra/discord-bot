const { handleMusicButton } = require('./musicButton');

async function interactionCreate(interaction, client) {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: 'There was an error executing this command!',
                ephemeral: true
            });
        }
    } else if (interaction.isButton()) {
        await handleMusicButton(interaction, client);
    }
}

module.exports = { interactionCreate };