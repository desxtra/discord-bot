const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    async registerCommands(client) {
        const commands = [];
        
        // Read command files
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const commandModule = require(filePath);
                
                // Handle module exports with commands property
                if (commandModule.commands) {
                    commandModule.commands.forEach(cmd => {
                        if (cmd.data && cmd.execute) {
                            client.commands.set(cmd.data.name, cmd);
                            commands.push(cmd.data.toJSON());
                        }
                    });
                }
                // Handle direct array exports
                else if (Array.isArray(commandModule)) {
                    commandModule.forEach(cmd => {
                        if (cmd.data && cmd.execute) {
                            client.commands.set(cmd.data.name, cmd);
                            commands.push(cmd.data.toJSON());
                        }
                    });
                }
                // Handle single command exports
                else if (commandModule.data && commandModule.execute) {
                    client.commands.set(commandModule.data.name, commandModule);
                    commands.push(commandModule.data.toJSON());
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            console.log('Started refreshing application (/) commands.');

            // Get the first guild the bot is in
            const guild = client.guilds.cache.first();
            if (!guild) {
                throw new Error('Bot is not in any guild yet!');
            }

            console.log(`Registering commands for guild: ${guild.name} (${guild.id})`);

            const data = await rest.put(
                Routes.applicationGuildCommands(client.user.id, guild.id),
                { body: commands },
            );

            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            console.error('Error refreshing commands:', error);
        }
    }
};