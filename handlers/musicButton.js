async function handleMusicButton(interaction, client) {
    if (!interaction.isButton()) return;

    try {
        await interaction.deferReply({ ephemeral: true });
        
        const queue = client.musicQueues.get(interaction.guildId);
        if (!queue) {
            return await interaction.editReply({ content: 'There is no active music queue!' });
        }

        switch (interaction.customId) {
            case 'pause':
                if (!queue.player.pause()) {
                    return await interaction.editReply({ content: 'The music is already paused!' });
                }
                await interaction.editReply({ content: 'Paused the music!' });
                break;

            case 'resume':
                if (!queue.player.unpause()) {
                    return await interaction.editReply({ content: 'The music is already playing!' });
                }
                await interaction.editReply({ content: 'Resumed the music!' });
                break;

            case 'skip':
                if (queue.songs.length <= 1) {
                    queue.songs = [];
                    queue.player.stop();
                    queue.connection.destroy();
                    client.musicQueues.delete(interaction.guildId);
                    return await interaction.editReply({ content: 'No more songs in queue. Disconnecting!' });
                }
                queue.player.stop(); // This will trigger the 'idle' event which will play the next song
                await interaction.editReply({ content: 'Skipped the current song!' });
                break;

            case 'stop':
                queue.songs = [];
                queue.player.stop();
                queue.connection.destroy();
                client.musicQueues.delete(interaction.guildId);
                await interaction.editReply({ content: 'Stopped the music and cleared the queue!' });
                break;

            default:
                await interaction.editReply({ content: 'Unknown button interaction!' });
        }
    } catch (error) {
        console.error('Button interaction error:', error);
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: 'There was an error processing your request!' });
            } else {
                await interaction.reply({ content: 'There was an error processing your request!', ephemeral: true });
            }
        } catch (e) {
            console.error('Error while handling button error:', e);
        }
    }
}

module.exports = { handleMusicButton };