const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const config = require('../../config.json');
const creds = require('../../google-creds.json');

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

function mentionOrTBD(id) {
    return id && id.trim() !== '' ? `<@${id}>` : 'TBD';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('claim_media')
        .setDescription('(MEDIA) Claim media responsibilities for a match')
        .addStringOption(option =>
            option.setName('match_id')
                .setDescription('Match ID')
                .setRequired(true)
        ),

    async execute(interaction) {
        const matchId = interaction.options.getString('match_id');
        const user = interaction.user;

        // Step 1: Fetch full match row with claim columns included (A-K)
        let sheetData;
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: 'MATCHES!A2:K',
            });
            sheetData = res.data.values;
        } catch (err) {
            console.error('❌ Sheets error:', err);
            return interaction.reply({ content: '❌ Could not access match data.', ephemeral: true });
        }

        // Step 2: Find match row index & data
        const rowIndex = sheetData.findIndex(row => row[0] === matchId);
        if (rowIndex === -1) {
            return interaction.reply({ content: `❌ Match ID \`${matchId}\` not found.`, ephemeral: true });
        }
        const matchRow = sheetData[rowIndex];

        // Destructure columns for clarity
        const [
            _,
            competition,
            round,
            team1,
            team2,
            time,
            messageId,
            mainRefereeId,
            coverRefereeId,
            mediaId,
            statsId,
        ] = matchRow;

        if (!messageId) {
            return interaction.reply({ content: `❌ No embed message logged for match \`${matchId}\`.`, ephemeral: true });
        }

        // Step 3: Check if media is already claimed
        if (mediaId && mediaId.trim() !== '') {
            return interaction.reply({
                content: '❌ Media role is already claimed for this match.',
                ephemeral: true,
            });
        }

        // Step 4: Fetch the announcement message
        const channel = interaction.client.channels.cache.get(config.matchAnnouncementChannelId);
        if (!channel) {
            return interaction.reply({ content: '❌ Announcement channel not found.', ephemeral: true });
        }

        let message;
        try {
            message = await channel.messages.fetch(messageId);
        } catch (err) {
            console.error('❌ Failed to fetch message:', err);
            return interaction.reply({ content: '❌ Failed to fetch match embed. Maybe it was deleted?', ephemeral: true });
        }

        // Step 5: Update embed preserving other claims and updating only Media
        const oldEmbed = message.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed).setFields([
            { name: 'Competition', value: competition, inline: true },
            { name: 'Round', value: round, inline: true },
            { name: 'Time', value: time, inline: false },
            { name: 'Team 1', value: team1, inline: true },
            { name: 'Team 2', value: team2, inline: true },
            {
                name: '\u200B',
                value:
                    `Main Referee: ${mentionOrTBD(mainRefereeId)}\n` +
                    `Cover Referee: ${mentionOrTBD(coverRefereeId)}\n` +
                    `Media: <@${user.id}>\n` +
                    `Stats: ${mentionOrTBD(statsId)}`,
                inline: false,
            },
        ]);

        // Step 6: Edit the embed message
        await message.edit({ embeds: [newEmbed] });

        // Step 7: Update Google Sheet Media column (J / index 9)
        const sheetRange = `MATCHES!J${rowIndex + 2}`;
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheetId,
                range: sheetRange,
                valueInputOption: 'RAW',
                requestBody: { values: [[user.id]] },
            });
        } catch (err) {
            console.error('❌ Failed to update Google Sheets:', err);
            return interaction.reply({ content: '❌ Failed to update claim data.', ephemeral: true });
        }

        // Step 8: Confirm claim
        return interaction.reply({ content: `✅ You are now handling media for match \`${matchId}\`.`, ephemeral: true });
    },
};