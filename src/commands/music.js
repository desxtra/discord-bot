const { SlashCommandBuilder } = require('@discordjs/builders');
const { MusicService } = require('../core/MusicService');
const { isUserInVoiceChannel, isBotInSameVoiceChannel } = require('../utils/voiceUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music player commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Play a song')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('The song to play')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('skip')
                .setDescription('Skip the current song'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop the music player'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('queue')
                .setDescription('Show the current queue')),

    async execute(interaction) {
        await interaction.deferReply();
        
        const subcommand = interaction.options.getSubcommand();
        const { guild, member } = interaction;

        if (!guild.musicPlayer) {
            guild.musicPlayer = new MusicService(guild);
        }

        // Voice channel validation
        if (subcommand !== 'queue') {
            if (!isUserInVoiceChannel(member)) {
                await interaction.editReply('You need to be in a voice channel!');
                return;
            }

            if (subcommand !== 'play' && !isBotInSameVoiceChannel(guild, member)) {
                await interaction.editReply('You need to be in the same voice channel as the bot!');
                return;
            }
        }

        try {
            switch (subcommand) {
                case 'play': {
                    const query = interaction.options.getString('query');
                    await guild.musicPlayer.play(interaction, query);
                    break;
                }
                case 'skip':
                    await guild.musicPlayer.skip(interaction);
                    break;
                case 'stop':
                    await guild.musicPlayer.stop(interaction);
                    break;
                case 'queue':
                    await guild.musicPlayer.showQueue(interaction);
                    break;
            }
        } catch (error) {
            console.error(`Error in music command (${subcommand}):`, error);
            if (!interaction.replied) {
                await interaction.editReply('There was an error executing this command.');
            }
        }
    },
};