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
        .setName('updatematch')
        .setDescription('Update an existing match')
        .addStringOption(option => option.setName('match_id').setDescription('Match ID to update').setRequired(true))
        .addStringOption(option => option.setName('competition').setDescription('Competition').setRequired(true)
            .addChoices(
                { name: 'Continental Cup', value: 'Continental Cup' },
                { name: 'Legacy Cup', value: 'Legacy Cup' },
                { name: 'Regular Season', value: 'Regular Season' }
            ))
        .addStringOption(option => option.setName('round').setDescription('Round number').setRequired(true))
        .addStringOption(option => option.setName('team1').setDescription('Team 1').setRequired(true))
        .addStringOption(option => option.setName('team2').setDescription('Team 2').setRequired(true))
        .addStringOption(option => option.setName('time').setDescription('Match time').setRequired(true)),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role =>
            config.adminRoleIds.includes(role.id)
        );

        if (!hasPermission) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const matchId = interaction.options.getString('match_id');
        const competition = interaction.options.getString('competition');
        const round = interaction.options.getString('round');
        const team1 = interaction.options.getString('team1');
        const team2 = interaction.options.getString('team2');
        const time = interaction.options.getString('time');

        try {
            // Fetch sheet rows
            const getRes = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: 'MATCHES!A2:Z', // skip headers
            });

            const rows = getRes.data.values;
            if (!rows) return interaction.reply({ content: '❌ No match data found.', ephemeral: true });

            const matchIndex = rows.findIndex(row => row[0] === matchId);

            if (matchIndex === -1) {
                return interaction.reply({ content: `❌ Match with ID \`${matchId}\` not found.`, ephemeral: true });
            }

            // Update match row
            const targetRow = matchIndex + 2; // +2 because A2 is row 2
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheetId,
                range: `MATCHES!A${targetRow}:G${targetRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[matchId, competition, round, team1, team2, time]]
                }
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: "LA LEGA - Matchmaking",
                    iconURL: "https://media.discordapp.net/attachments/1300416251189002252/1358780991430197339/AVL_SPIKE.png?ex=684430e9&is=6842df69&hm=125a72870ced326cdc65e000ddbc46702cfd99b32312482d091481cbd66709b5&",
                })
                .setTitle(`🔄 Match Updated: ${matchId}`)
                .addFields(
                    { name: 'Competition', value: competition, inline: true },
                    { name: 'Round', value: round, inline: true },
                    { name: 'Time', value: time, inline: false },
                    { name: 'Team 1', value: team1, inline: true },
                    { name: 'Team 2', value: team2, inline: true }
                )
                .setColor(0xFFA500)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('❌ Error updating match:', err);
            await interaction.reply({ content: '❌ Failed to update match.', ephemeral: true });
        }
    }
};