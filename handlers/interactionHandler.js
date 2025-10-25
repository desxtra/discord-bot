const { InteractionType } = require('discord.js');

module.exports = {
    async interactionCreate(interaction, client) {
        // Handle slash commands
        if (interaction.type === InteractionType.ApplicationCommand) {
            const command = client.commands.get(interaction.commandName);
            
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                
                const errorMessage = 'There was an error while executing this command!';
                
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ 
                            content: errorMessage, 
                            flags: 64 // Equivalent to ephemeral
                        });
                    } else {
                        await interaction.reply({ 
                            content: errorMessage, 
                            flags: 64 // Equivalent to ephemeral
                        });
                    }
                } catch (replyError) {
                    console.error('Failed to send error message:', replyError);
                }
            }
        }
        
        // Handle button interactions
        if (interaction.isButton()) {
            try {
                const [action, guildId] = interaction.customId.split('_');
                
                if (guildId !== interaction.guildId) {
                    return await interaction.reply({ 
                        content: 'This button is not for this server!', 
                        flags: 64 
                    });
                }

                const queue = client.musicQueues.get(interaction.guildId);
                
                if (!queue) {
                    return await interaction.reply({ 
                        content: 'No music is currently playing!', 
                        flags: 64 
                    });
                }

                switch (action) {
                    case 'pause':
                        if (queue.player.state.status === AudioPlayerStatus.Playing) {
                            queue.player.pause();
                            await interaction.reply({ 
                                content: 'Music paused!', 
                                flags: 64 
                            });
                        } else {
                            await interaction.reply({ 
                                content: 'Music is not playing!', 
                                flags: 64 
                            });
                        }
                        break;
                        
                    case 'resume':
                        if (queue.player.state.status === AudioPlayerStatus.Paused) {
                            queue.player.unpause();
                            await interaction.reply({ 
                                content: 'Music resumed!', 
                                flags: 64 
                            });
                        } else {
                            await interaction.reply({ 
                                content: 'Music is not paused!', 
                                flags: 64 
                            });
                        }
                        break;
                        
                    case 'skip':
                        if (queue.songs.length > 0) {
                            const skippedSong = queue.songs[0];
                            queue.player.stop();
                            await interaction.reply({ 
                                content: `Skipped **${skippedSong.title}**`, 
                                flags: 64 
                            });
                        } else {
                            await interaction.reply({ 
                                content: 'No songs to skip!', 
                                flags: 64 
                            });
                        }
                        break;
                        
                    case 'stop':
                        queue.songs = [];
                        queue.player.stop();
                        if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                            queue.connection.destroy();
                        }
                        client.musicQueues.delete(interaction.guildId);
                        await interaction.reply({ 
                            content: 'Stopped the music and cleared the queue!', 
                            flags: 64 
                        });
                        break;
                        
                    default:
                        await interaction.reply({ 
                            content: 'Unknown button action!', 
                            flags: 64 
                        });
                }
            } catch (error) {
                console.error('Button interaction error:', error);
                try {
                    await interaction.reply({ 
                        content: 'There was an error processing this button!', 
                        flags: 64 
                    });
                } catch (replyError) {
                    console.error('Failed to send button error message:', replyError);
                }
            }
        }
    }
};