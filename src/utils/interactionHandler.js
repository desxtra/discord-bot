async function handleInteraction(client, interaction) {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing command:', error);
        throw error; // Let the main error handler deal with it
    }
}

module.exports = { handleInteraction };