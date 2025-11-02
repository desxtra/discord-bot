const fs = require('fs');
const path = require('path');

async function loadCommands(client) {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }

    // Register commands
    const commands = Array.from(client.commands.values()).map(command => command.data.toJSON());
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        // Register commands for all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            console.log(`Registering commands for guild: ${guild.name} (${guild.id})`);
            await guild.commands.set(commands);
        }
        
        console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

module.exports = { loadCommands };