const { REST, Routes } = require('discord.js');
const musicCommands = require('../commands/music.js');

async function registerCommands(client) {
    const commands = [...musicCommands];
    
    const commandData = commands.map(command => command.data.toJSON());
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandData }
        );

        console.log('Successfully reloaded application (/) commands.');

        // Register commands in the client.commands Collection
        commands.forEach(command => {
            client.commands.set(command.data.name, command);
        });
    } catch (error) {
        console.error(error);
    }
}

module.exports = { registerCommands };