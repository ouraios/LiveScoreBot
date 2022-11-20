const request = require('request-promise');
const { table } = require('table');
const Discord = require('discord.js');
const { RTMClient, WebClient } = require('@slack/client');
const argv = require('minimist')(process.argv.slice(2));
const FootballLiveScore = require('./FootballLiveScore')

if(!argv.discordToken && !argv.slackSigningSecret){
    console.log("Please provide at least a token for discord client or for slack client !");
    process.exit(1);
}

if(argv.slackSigningSecret &&  !argv.slackBotToken){
    console.log("Please provide a slack bot token if you want to use Slack client !");
    process.exit(2);
}
const footballLiveScore = new FootballLiveScore();
footballLiveScore.start(argv.discordToken, argv.slackSigningSecret, argv.slackBotToken);