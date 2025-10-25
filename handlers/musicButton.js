async function handleMusicButton(interaction, client) {
    if (!interaction.isButton()) return;

    const queue = client.musicQueues.get(interaction.guildId);
    if (!queue) {
        return interaction.reply({ content: 'There is no active music queue!', ephemeral: true });
    }

    switch (interaction.customId) {
        case 'pause':
            queue.player.pause();
            await interaction.reply({ content: 'Paused the music!', ephemeral: true });
            break;

        case 'resume':
            queue.player.unpause();
            await interaction.reply({ content: 'Resumed the music!', ephemeral: true });
            break;

        case 'skip':
            queue.player.stop(); // This will trigger the 'idle' event which will play the next song
            await interaction.reply({ content: 'Skipped the current song!', ephemeral: true });
            break;

        case 'stop':
            queue.songs = [];
            queue.player.stop();
            queue.connection.destroy();
            client.musicQueues.delete(interaction.guildId);
            await interaction.reply({ content: 'Stopped the music and cleared the queue!', ephemeral: true });
            break;
    }
}

module.exports = { handleMusicButton };