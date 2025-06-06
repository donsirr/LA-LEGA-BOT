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
        .setName('creatematch')
        .setDescription('(ADMIN) Create a new match')
        .addStringOption(option => option.setName('match_id').setDescription('Match ID').setRequired(true))
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

        // Preview Embed
        const previewEmbed = new EmbedBuilder()
            .setAuthor({
                name: "LA LEGA - Matchmaking",
                iconURL: "https://media.discordapp.net/attachments/1300416251189002252/1358780991430197339/AVL_SPIKE.png",
            })
            .addFields(
                { name: 'Competition', value: competition, inline: true },
                { name: 'Round', value: round, inline: true },
                { name: 'Time', value: time, inline: false },
                { name: 'Team 1', value: team1, inline: true },
                { name: 'Team 2', value: team2, inline: true }
            )
            .setColor(0x00AE86)
            .setFooter({text: `${matchId}`})
            .setTimestamp();

        await interaction.reply({ embeds: [previewEmbed], ephemeral: true });

        // Match Embed for Announcement Channel
        const embed = EmbedBuilder.from(previewEmbed).setAuthor({name: "LA LEGA - Match Alert", iconURL: "https://media.discordapp.net/attachments/1300416251189002252/1358780991430197339/AVL_SPIKE.png?ex=684430e9&is=6842df69&hm=125a72870ced326cdc65e000ddbc46702cfd99b32312482d091481cbd66709b5&"});
        
        const announcementChannel = interaction.client.channels.cache.get(config.matchAnnouncementChannelId);
        if (!announcementChannel) {
            return interaction.followUp({ content: '❌ Could not find match announcement channel.', ephemeral: true });
        }

        const message = await announcementChannel.send({ embeds: [embed] });
        const messageId = message.id;

        // Append row with empty MESSAGE ID, then update it
        let rowIndex = null;

        try {
            const appendRes = await sheets.spreadsheets.values.append({
                spreadsheetId: config.spreadsheetId,
                range: 'MATCHES!A2',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: {
                    values: [[matchId, competition, round, team1, team2, time, ""]]
                }
            });

            // Parse row number from updatedRange (e.g., MATCHES!A7 → 7)
            const updatedRange = appendRes.data.updates.updatedRange;
            rowIndex = parseInt(updatedRange.match(/\d+$/)[0]);

            // Now update the MESSAGE ID in column G
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheetId,
                range: `MATCHES!G${rowIndex}`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[messageId]]
                }
            });

        } catch (err) {
            console.error('❌ Failed to log to Google Sheets:', err);
            await interaction.followUp({ content: '✅ Match created, but failed to log to Sheets.', ephemeral: true });
        }
    }
};
