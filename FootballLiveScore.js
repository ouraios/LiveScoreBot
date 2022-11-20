const Discord = require("discord.js");
const {table} = require("table");
const { App } = require('@slack/bolt');
const got = require('got');
class FootballLiveScore {

    // DATA
    matches = [];
    currentMatches = [];
    matchIndex = null;
    slackClient = null;
    slackConversationId = null;
    discordClient = null;
    discordSubscribesChannels = [];

    // INIT
    start (discordToken, slackSigningSecret, slackBotToken) {
        if(slackSigningSecret){
            this.initSlack(slackSigningSecret, slackBotToken);
        }
        if(discordToken){
            this.initDiscord(discordToken);
        }

        got('https://api.fifa.com/api/v3/calendar/matches?language=fr&idCompetition=17&idSeason=255711&idStage=285063&idMatch=400128082&count=400').json()
        .then(data => {
            this.matches = data.Results;
            console.log("Les matchs ont été chargés !");
        });

        setInterval(() => {
            console.log("Recherche d'un match en cours ...");
            if(this.currentMatches.length === 0){
                let maybeMatches = this.getNextMatch();
                if(maybeMatches === false){
                    console.log('No match found !');
                    return;
                }else{
                    for(var i = 0; i < maybeMatches.length; i++){
                        maybeMatches[i].Home.Goals = [];
                        maybeMatches[i].Away.Goals = [];
                        maybeMatches[i].Home.Score = 0;
                        maybeMatches[i].Away.Score = 0;
                        this.sendMessage("Le match "+maybeMatches[i].Home.TeamName[0].Description+" - "+maybeMatches[i].Away.TeamName[0].Description+" a commencé !");
                    }
                    this.currentMatches = maybeMatches;
                }
            }

            console.log("Recherche du score en cours ...");

            for (var i = 0; i < this.currentMatches.length; i++){
                this.getMatchDetails(i, this.currentMatches[i]);
            }


        }, 10000)
    }

    // METHODS
    getMatchDetails (index, match){
        got('https://api.fifa.com/api/v3/live/football/17/255711/'+match.IdStage+'/'+match.IdMatch+'?language=fr').json()
        .then(tmpMatch =>{
            var goal = false;
            var countryName = "";
            match.MatchTime = tmpMatch.MatchTime;
            this.matches[match.index].MatchTime = tmpMatch.MatchTime;
            if(tmpMatch.HomeTeam.Goals.length !== match.Home.Goals.length){
                goal = tmpMatch.HomeTeam.Goals[tmpMatch.HomeTeam.Goals.length-1];
                goal.countryName = match.Home.TeamName[0].Description;
                goal.playerName = this.findPlayerName(goal.IdPlayer, tmpMatch);
                match.Home.Goals.push(goal);
                match.Home.Score = match.Home.Goals.length;
            }else if(tmpMatch.AwayTeam.Goals.length !== match.Away.Goals.length){
                goal = tmpMatch.AwayTeam.Goals[tmpMatch.AwayTeam.Goals.length-1];
                goal.countryName = match.Away.TeamName[0].Description;
                goal.playerName = this.findPlayerName(goal.IdPlayer, tmpMatch);
                match.Away.Goals.push(goal);
                match.Away.Score = match.Away.Goals.length;
            }
            this.currentMatches[index] = match;
            if(goal !== false){
                this.sendMessage("GOAAAAAAAAAAAAAAAAAAAAL !!!\nBut de " + goal.playerName + " pour " + goal.countryName + " à la  " + goal.Minute +"eme minute !!!\n" + this.computeGoalsString(match.index));
            }
            if(tmpMatch.MatchStatus == 0){
                this.sendMessage("Match terminé !\nScore final : \n" + this.computeGoalsString(match.index));
                this.matches[match.index].MatchStatus = tmpMatch.MatchStatus;
                this.currentMatches.splice(index, 1);
            }

        });
    }
    computeAnswer (message, clientName, channelId){
        var maybeCommand = message.split(" ");
        if(maybeCommand[0] !== '!livescore'){
            return false;
        }else if (maybeCommand.length === 1) {
            return this.computeGoalsString();
        }else{
            switch(maybeCommand[1]){

                // FOR DISCORD ONLY
                case 'subscribe':
                    if(clientName != 'discord'){
                        return "Cette action est disponible uniquement pour un client discord !";
                    }
                    if(this.discordSubscribesChannels.indexOf(channelId) === -1){
                        this.discordSubscribesChannels.push(channelId)
                    }
                    return "Ce channel est maintenant abonné aux évènements des matchs en temps réel !";
                    break;

                // FOR DISCORD ONLY
                case 'unsubscribe':
                    if(clientName != 'discord'){
                        return "Cette action est disponible uniquement pour un client discord !";
                    }
                    let indexToRemove = this.discordSubscribesChannels.indexOf(channelId)
                    if(indexToRemove > -1){
                        this.discordSubscribesChannels.splice(indexToRemove, 1);
                        return "Ce channel n'est plus abonné aux évènements des matchs en temps réel !";
                    }else{
                        return "Ce channel n'est déjà pas abonné aux évènements en temps réel !";
                    }

                    break;
                case 'list':
                    return this.listFinishedMatched();
                    break;
                case 'stats':
                    if(!maybeCommand[2]){
                        maybeCommand[2] = this.matches.filter(match => {
                            var matchDate = new Date(match.Date);
                            matchDate.setHours(matchDate.getHours()+2);
                            return (new Date()).toISOString() > matchDate.toISOString()
                        }).length-1;
                    }
                    return this.getMatchStats(maybeCommand[2])
                    break;
                case 'help':
                default:
                    var helpStr = "\n`!livescore` : Donne le score en temps réel du match en cours";
                    helpStr += clientName == 'discord' ? "\n`!livescore subscribe` : permet de recevoir en instantané le suivi des évènements du match en cours" : "";
                    helpStr += clientName == 'discord' ? "\n`!livescore unsubscribe` : permet d'arrêter de recevoir le suivi en instanté des évènements du match en cours" : "";
                    helpStr += "\n`!livescore list` : liste les matchs passés avec leur numéro";
                    helpStr += "\n`!livescore stats <numeroMatch>` : Donne les stats détaillées du numéro de match donné, si aucun numéro de match n'est donné alors ce sera les stats du match en cours ou du dernier match effectué qui seront données";
                    return helpStr;
                    break;
            }
        }
    }
    initDiscord (discordToken){
        this.discordClient = new Discord.Client();

        this.discordClient.on('ready', () => {
            console.log(`Logged in as ${this.discordClient.user.tag}!`);
        });

        this.discordClient.on('error', (err) => {
            console.log('An error occured : ');
            console.log(err);
        });

        this.discordClient.on('message', (msg) => {
            if(msg.author == this.discordClient.user) return;
            let answer = this.computeAnswer(msg.content, 'discord', msg.channel.id);
            if(answer === false){
                return;
            }
            // Si c'est une promesse on la traite comme tel
            if(Promise.resolve(answer) == answer) {
                answer.then(answserStr => {msg.reply(answserStr)});
                // Si c'est une string et qu'elle est non vide on répond directement
            } else if(typeof answer === 'string' && answer.length > 0) {
                msg.reply(answer);
            }
        });

        this.discordClient.login(discordToken);

    }
    initSlack (slackSigningSecret, slackBotToken){
        this.slackClient = new App({
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            token: slackBotToken,
        });
        this.slackClient.start(3030).then(() => {
            console.log('⚡️ Slack Bolt app is running!');
            this.slackClient.message(async ({ message, say }) => {

                // Skip messages that are from a bot or my own user ID
                if ( (message.subtype && message.subtype === 'bot_message') ||
                    (!message.subtype && message.user === this.slackClient.activeUserId) ) {
                    return;
                }
                let answer = this.computeAnswer(message.text, 'slack', null);

                if(answer === false){
                    return;
                }
                // Si c'est une promesse on la traite comme tel
                if(Promise.resolve(answer) == answer) {
                    answer.then(answserStr => say(answserStr));
                    // Si c'est une string et qu'elle est non vide on répond directement
                } else if(typeof answer === 'string' && answer.length > 0) {
                    say(answer)
                }
            })
        })
    }

    getNextMatch (){
        if(!this.matches){
            return false;
        }
        var foundMatches = [];
        for(var i = 0; i < this.matches.length; i++){
            let match = this.matches[i]
            var matchDate = new Date(match.Date);
            matchDate.setHours(matchDate.getHours()+2);
            if((new Date()).toISOString() < matchDate.toISOString() &&
                (new Date(match.Date).toISOString()) <= (new Date()).toISOString() && match.MatchStatus != 0){
                match.index = i;
                foundMatches.push(match);
            }
        }
        return foundMatches.length > 0 ? foundMatches : false;
    }

    listFinishedMatched (){
        if(!this.matches){
            return "Aucun match à lister !";
        }
        // let foundMatches = matches.filter((match) => {
        var finishedMatches = this.matches.filter((match) => {
            var matchDate = new Date(match.Date);
            matchDate.setHours(matchDate.getHours()+3);
            return (new Date()).toISOString() > matchDate.toISOString() && match.MatchStatus == 0
        });
        var finalStr ="";

        for(var i = 0; i < finishedMatches.length; i++){
            finalStr += 'Match n°' + i + ' : ' + finishedMatches[i].Home.TeamName[0].Description + ' - ' + finishedMatches[i].Away.TeamName[0].Description + '\n'
        }
        return finalStr;

    }

    findPlayerName (playerId, match){
        for(var i = 0; i < match.HomeTeam.Players.length; i++){
            if(match.HomeTeam.Players[i].IdPlayer == playerId){
                return match.HomeTeam.Players[i].PlayerName[0].Description;
            }
        }
        for(var j = 0; j < match.HomeTeam.Players.length; j++){
            if(match.AwayTeam.Players[j].IdPlayer == playerId){
                return match.AwayTeam.Players[j].PlayerName[0].Description;
            }
        }
    }

    computeGoalsString (matchIndex){
        var finalString = "";
        var currentMatch;
        if(!this.currentMatches.length && !matchIndex){
            return "Il n'y a pas de match en cours ! ";
        }
        if(matchIndex){
            currentMatch = this.matches[matchIndex];
            if(!currentMatch){
                return "Ce numéro de match ne correspond à aucun match effectué !";
            }
            finalString += currentMatch.MatchTime ? currentMatch.MatchTime+" minute " : "";
            finalString += currentMatch.Home.TeamName[0].Description + " " + currentMatch.Home.Score + " - ";
            finalString += currentMatch.Away.Score + " " + currentMatch.Away.TeamName[0].Description;
        }else {
            for(var i = 0; i < this.currentMatches.length; i++){
                currentMatch = this.currentMatches[i];
                finalString += currentMatch.MatchTime ? currentMatch.MatchTime+" minute " : "";
                finalString += currentMatch.Home.TeamName[0].Description + " " + currentMatch.Home.Score + " - ";
                finalString +=  currentMatch.Away.Score + " " + currentMatch.Away.TeamName[0].Description+"\n";
            }
        }


        return finalString;
    }

    getMatchStats (matchIndex){
        return new Promise((resolve, reject) => {
            var match = this.matches[matchIndex]
            if(!match){
                resolve("Ce numéro de match ne correspond à aucun match effectué !");
            }

            got('https://fdh-api.fifa.com/v1/stats/match/' + match.Properties.IdIFES + '/teams.json')
            .json()
            .then(matchStats => {
                let homeTeamStats = {};
                let awayTeamStats = {};
                for(let item of matchStats[match.Home.IdTeam]) homeTeamStats[item[0]] = item[1];
                for(let item of matchStats[match.Away.IdTeam]) awayTeamStats[item[0]] = item[1];
                // Possession neutre qu'on partage de façon équilibré entre les 2 équipes
                let neutralPossession = matchStats[-1][0][1] / 2
                homeTeamStats.Possession += neutralPossession
                awayTeamStats.Possession += neutralPossession

                // obligé de commenter certaines stats car limite de 2000 caractères sur les messages discord
                let tableStat = [
                    [match.Home.TeamName[0].Description, "Stat de l'équipe", match.Away.TeamName[0].Description],
                    [Math.round(homeTeamStats.Possession*100) + '%', "Possession", Math.round(awayTeamStats.Possession*100) + '%'],
                    [homeTeamStats.Goals, "Buts", awayTeamStats.Goals],
                    // [homeTeamStats.OwnGoals, "Buts contre son camp", awayTeamStats.OwnGoals],
                    [homeTeamStats.Assists, "Passes décisives", awayTeamStats.Assists],
                    [homeTeamStats.AttemptAtGoalOnTarget, "Tirs cadrés", awayTeamStats.AttemptAtGoalOnTarget],
                    [homeTeamStats.AttemptAtGoalOffTarget, "Tirs non cadrés", awayTeamStats.AttemptAtGoalOffTarget],
                    [homeTeamStats.Passes, "Passes", awayTeamStats.Passes],
                    [homeTeamStats.PassesCompleted, "Passes réussies", awayTeamStats.PassesCompleted],
                    [homeTeamStats.Crosses, "Centres", awayTeamStats.Crosses],
                    // [homeTeamStats.CrossesCompleted, "Centres réussis", awayTeamStats.CrossesCompleted],
                    [homeTeamStats.Corners, "Corners", awayTeamStats.Corners],
                    [homeTeamStats.FreeKicks, "Coups francs", awayTeamStats.FreeKicks],
                    [homeTeamStats.Penalties, "Penalties", awayTeamStats.Penalties],
                    // [homeTeamStats.PenaltiesScored, "Penalties transformés", awayTeamStats.PenaltiesScored],
                    // [homeTeamStats.AttemptAtGoalBlocked, "Arrêts", awayTeamStats.AttemptAtGoalBlocked],
                    [homeTeamStats.Offsides, "Hors Jeu", awayTeamStats.Offsides],
                    [homeTeamStats.FoulsAgainst, "Fautes", awayTeamStats.FoulsAgainst],
                    [homeTeamStats.YellowCards, "Carton jaune", awayTeamStats.YellowCards],
                    [homeTeamStats.RedCards, "Carton rouge", awayTeamStats.RedCards]
                ];
                let tableOutput = table(tableStat);
                console.log(tableOutput);
                console.log(tableOutput.length);
                resolve(this.computeGoalsString(matchIndex)+'\n```\n'+tableOutput+'\n```')
            })
        })


    }

    sendMessage (message, channel = null){
        console.log(message);
        if(this.slackClient !== null){
            this.slackClient.sendMessage(message, channel ? channel : this.slackConversationId);
        }
        if(this.discordClient !== null){
            this.discordSubscribesChannels.forEach((channelId) => {
                this.discordClient.channels.get(channelId).send(message);
            })
        }
    }
}

module.exports = FootballLiveScore