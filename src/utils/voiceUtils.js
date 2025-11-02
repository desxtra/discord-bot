function isUserInVoiceChannel(member) {
    return member.voice.channel !== null;
}

function isBotInSameVoiceChannel(guild, member) {
    const botVoiceChannel = guild.members.me.voice.channel;
    return botVoiceChannel && botVoiceChannel.id === member.voice.channel.id;
}

module.exports = {
    isUserInVoiceChannel,
    isBotInSameVoiceChannel
};