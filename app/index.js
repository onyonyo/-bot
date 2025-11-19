const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// ------------------ SlashCommand登録 ------------------
const commands = [
    new SlashCommandBuilder()
        .setName('boshu')
        .setDescription('募集を開始します')
        .addIntegerOption(opt =>
            opt.setName('limit').setDescription('参加人数の上限（デフォルト4）')
        )
        .addStringOption(opt =>
            opt.setName('deadline').setDescription('締め切り時刻（例: 10m, 21:30）')
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Slash Command registered.');
    } catch (e) {
        console.error(e);
    }
})();

// ------------------ 募集ロジック ------------------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // -------- /boshu コマンド --------
    if (interaction.commandName === 'boshu') {
        const limit = interaction.options.getInteger('limit') || 4;
        const deadlineInput = interaction.options.getString('deadline') || '10m';

        // 締め切り時間の計算
        const deadlineTime = parseDeadline(deadlineInput);
        if (!deadlineTime) {
            return interaction.reply({ content: '締め切りの形式が不正です（例: 10m, 21:30）', ephemeral: true });
        }

        const participants = [];
        const endTimestamp = Date.now() + deadlineTime;
        const ownerId = interaction.user.id; // 募集主

        // ボタン：参加 + 解除 + キャンセル
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('join')
                .setLabel('参加')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('leave')
                .setLabel('❎ 参加解除')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Danger)
        );

        const embed = {
            title: "📣 募集開始！",
            description: `参加したい方は下のボタンを押してください！\n**上限: ${limit}人**\n**締め切り: <t:${Math.floor(endTimestamp / 1000)}:R>**`,
            color: 0x00bfff,
            fields: [
                { name: "参加者", value: "まだいません" }
            ]
        };

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // ボタンのコレクター
        const collector = msg.createMessageComponentCollector({
            time: deadlineTime
        });

        collector.on('collect', i => {

            // ----------- 参加ボタン -----------
            if (i.customId === 'join') {

                if (!participants.includes(i.user.id)) {
                    participants.push(i.user.id);
                }

                updateEmbed(embed, participants);
                i.update({ embeds: [embed] });

                if (participants.length >= limit) {
                    collector.stop('limit reached');
                }
            }

            // ----------- 参加解除ボタン（NEW） -----------
            if (i.customId === 'leave') {

                if (!participants.includes(i.user.id)) {
                    return i.reply({ content: "あなたは参加していません。", ephemeral: true });
                }

                const index = participants.indexOf(i.user.id);
                participants.splice(index, 1);

                updateEmbed(embed, participants);
                i.update({ embeds: [embed] });
            }

            // ----------- キャンセルボタン -----------
            if (i.customId === 'cancel') {
                if (i.user.id !== ownerId) {
                    return i.reply({ content: "あなたはこの募集をキャンセルできません。", ephemeral: true });
                }
                collector.stop('canceled');
                i.reply({ content: "募集が募集主によりキャンセルされました。", ephemeral: false });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'canceled') {
                embed.title = "🛑 募集キャンセル";
            } else {
                embed.title = "⏰ 募集終了";
            }
            msg.edit({ embeds: [embed], components: [] });
        });
    }
});

// ------------------ 参加者リスト更新関数 ------------------
function updateEmbed(embed, participants) {
    if (participants.length === 0) {
        embed.fields[0].value = "まだいません";
    } else {
        embed.fields[0].value = participants.map(id => `<@${id}>`).join('\n');
    }
}

// ------------------ 締め切り解析 ------------------
function parseDeadline(input) {
    // "10m" / "2h"
    if (/^\d+[mh]$/.test(input)) {
        const num = parseInt(input);
        if (input.endsWith('m')) return num * 60 * 1000;
        if (input.endsWith('h')) return num * 60 * 60 * 1000;
    }

    // "21:30" のような時刻
    const match = input.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
        const now = new Date();
        const target = new Date();
        target.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);

        if (target < now) target.setDate(target.getDate() + 1);

        return target - now;
    }

    return null;
}

client.login(process.env.TOKEN);
