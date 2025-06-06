const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const config = require('../../config.json');
const creds = require('../../google-creds.json');

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('(REFEREE) Claim a match to officiate.')
    .addStringOption(option =>
      option.setName('match_id').setDescription('Match ID').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('server_link').setDescription('Private match server invite (hidden)').setRequired(true)
    ),

  async execute(interaction) {
    const matchId = interaction.options.getString('match_id');
    const serverLink = interaction.options.getString('server_link');
    const user = interaction.user;

    // Step 1: Read full data including claim columns from Google Sheets
    let sheetData;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: 'MATCHES!A2:K',  // Extend range to include claim columns (G=6 to K=10)
      });
      sheetData = res.data.values;
    } catch (err) {
      console.error('❌ Failed to read Google Sheets:', err);
      return interaction.reply({ content: 'Failed to access match data.', ephemeral: true });
    }

    // Step 2: Find the row with the match_id
    const rowIndex = sheetData.findIndex(row => row[0] === matchId);
    if (rowIndex === -1) {
      return interaction.reply({ content: `❌ Match ID \`${matchId}\` not found.`, ephemeral: true });
    }
    const matchRow = sheetData[rowIndex];

    // Columns (0-based):
    // 0 = MATCH ID
    // 1 = COMPETITION
    // 2 = ROUND
    // 3 = TEAM 1
    // 4 = TEAM 2
    // 5 = TIME
    // 6 = MESSAGE ID
    // 7 = MAIN REFEREE (user id)
    // 8 = COVER REFEREE (user id)
    // 9 = MEDIA (user id)
    // 10 = STATS (user id)

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

    // Step 3: Check if main referee already claimed
    if (mainRefereeId && mainRefereeId.trim() !== '') {
      return interaction.reply({
        content: '❌ This match already has a Main Referee assigned.',
        ephemeral: true,
      });
    }

    // Step 4: Fetch the message from the announcement channel
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

    // Helper to format mention or TBD
    const mentionOrTBD = (id) => (id && id.trim() !== '' ? `<@${id}>` : 'TBD');

    // Step 5: Build updated embed preserving existing roles
    const oldEmbed = message.embeds[0];
    const newEmbed = EmbedBuilder.from(oldEmbed).setFields([
      { name: 'Competition', value: competition, inline: true },
      { name: 'Round', value: round, inline: true },
      { name: 'Time', value: time, inline: false },
      { name: 'Team 1', value: team1, inline: true },
      { name: 'Team 2', value: team2, inline: true },
      {
        name: '\u200B',
        value: `Main Referee: <@${user.id}>\nCover Referee: ${mentionOrTBD(coverRefereeId)}\nMedia: ${mentionOrTBD(mediaId)}\nStats: ${mentionOrTBD(statsId)}`,
        inline: false,
      },
    ]);

    // Step 6: Edit the message with updated embed
    await message.edit({ embeds: [newEmbed] });

    // Step 7: Update Google Sheet for Main Referee column (H / column 8)
    const sheetRange = `MATCHES!H${rowIndex + 2}`; // +2 because sheet rows start at 1 and first row is header

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

    // Step 8: DM user server link
    try {
      await user.send(`🔒 You claimed match \`${matchId}\`. Here’s your server link: ${serverLink}`);
    } catch {
      // Fallback if DM fails, still confirm claim
      await interaction.reply({ content: '✅ Claimed. Unable to DM you the server link.', ephemeral: true });
      return;
    }

    // Step 9: Final confirmation
    return interaction.reply({ content: `✅ Match \`${matchId}\` claimed successfully.`, ephemeral: true });
  },
};
