const request = require('request-promise');
const { table } = require('table');
const Discord = require('discord.js');
const { RTMClient, WebClient } = require('@slack/client');
const argv = require('minimist')(process.argv.slice(2));


if(!argv.discordToken && !argv.slackToken){
    console.log("Please provide at least a token for discord client or for slack client !");
    process.exit(1);
}

if(argv.slackToken &&  !argv.slackConversationId){
    console.log("Please provide a conversation Id if you want to use Slack client !");
    process.exit(2);
}


footballLiveScore = {
    
    // DATA
    matches: [],
    currentMatches: [],
    slackClient: null,
    slackConversationId: null,
    discordClient : null,
    discordSubscribesChannels: [],

    // INIT
    start: function(){
        if(argv.slackToken && argv.slackConversationId){
            this.initSlack(argv.slackToken, argv.slackConversationId);
        }
        if(argv.discordToken){
            this.initDiscord(argv.discordToken);
        }

        request.get({
            url: 'https://api.fifa.com/api/v1/calendar/matches?idseason=254645&idcompetition=17&language=fr-FR&count=100',
            json: true
        }).then(data => {
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
    },

    // METHODS
    getMatchDetails: function(index, match){
        request.get({
            url: 'https://api.fifa.com/api/v1/live/football/17/254645/'+match.IdStage+'/'+match.IdMatch+'?language=fr-FR',
            json: true
        }).then(tmpMatch =>{
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
    },
    computeAnswer: function(message, clientName, channelId){
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
                        
                        if(this.currentMatches.length != 0){
                            maybeCommand[2] = this.currentMatches[0].index;
                        }
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
    },
    initDiscord: function(discordToken){
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

    },
    initSlack: function(slackToken, conversationId){
        this.slackClient = new RTMClient(slackToken);
        this.slackClient.start();
        this.slackConversationId = conversationId;
        this.slackClient.on('message', (message) => {
        
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
                answer.then(answserStr => {this.slackClient.sendMessage(answserStr, message.channel)});
            // Si c'est une string et qu'elle est non vide on répond directement
            } else if(typeof answer === 'string' && test.length > 0) {
                this.slackClient.sendMessage(answer, message.channel);
            }
        });
    },

    getNextMatch : function(){
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
    },

    listFinishedMatched: function (){
        if(!this.matches){
            return "Aucun match à lister !";
        }
        // let foundMatches = matches.filter((match) => {
        var finishedMatches = this.matches.filter((match) => {
            var matchDate = new Date(match.Date);
            matchDate.setHours(matchDate.getHours()+2);
            return (new Date()).toISOString() > matchDate.toISOString() && match.MatchStatus == 0
        });
        var finalStr ="";
        
        for(var i = 0; i < finishedMatches.length; i++){
            finalStr += 'Match n°' + i + ' : ' + finishedMatches[i].Home.TeamName[0].Description + ' - ' + finishedMatches[i].Away.TeamName[0].Description + '\n'
        }
        return finalStr;

    },

    findPlayerName: function (playerId, match){
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
    },

    computeGoalsString: function (matchIndex = null){
        var finalString = "";
        var currentMatch;
        if(!this.currentMatches && !matchIndex){
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
    },

    getMatchStats: function (matchIndex){
        return new Promise((resolve, reject) => {
            var match = this.matches[matchIndex]
            if(!match){
                resolve("Ce numéro de match ne correspond à aucun match effectué !");
            }
        
            request.get({
                url: 'http://worldcup.sfg.io/matches/' + match.IdMatch,
                json: true
            }).then(matchStats => {
                let matchStat = matchStats[0];
                let tableStat = [
                    [match.Home.TeamName[0].Description, "Stat de l'équipe", match.Away.TeamName[0].Description],
                    [matchStat.home_team_statistics.attempts_on_goal, "Tirs", matchStat.away_team_statistics.attempts_on_goal],
                    [matchStat.home_team_statistics.on_target, "Tirs cadrés", matchStat.away_team_statistics.on_target],
                    //[matchStat.home_team_statistics.off_target, "Tirs non cadrés", matchStat.away_team_statistics.off_target],
                    //[matchStat.home_team_statistics.blocked, "Tirs bloqués", matchStat.away_team_statistics.blocked],
                    [matchStat.home_team_statistics.woodwork, "Barre transversale", matchStat.away_team_statistics.woodwork],
                    [matchStat.home_team_statistics.corners, "Corners", matchStat.away_team_statistics.corners],
                    [matchStat.home_team_statistics.offsides, "Hors-jeu", matchStat.away_team_statistics.offsides],
                    [matchStat.home_team_statistics.ball_possession+'%', "Possession de balles", matchStat.away_team_statistics.ball_possession+'%'],
                    [matchStat.home_team_statistics.num_passes, "Nb de passes", matchStat.away_team_statistics.num_passes],
                    [matchStat.home_team_statistics.passes_completed, "Nb passes réussies", matchStat.away_team_statistics.passes_completed],
                    [matchStat.home_team_statistics.pass_accuracy+'%', "Tx passes réussies", matchStat.away_team_statistics.pass_accuracy+'%'],
                    [matchStat.home_team_statistics.distance_covered+'km', "Distance courue", matchStat.away_team_statistics.distance_covered+'km'],
                    [matchStat.home_team_statistics.balls_recovered, "Balles récupérées", matchStat.away_team_statistics.balls_recovered],
                    [matchStat.home_team_statistics.tackles, "Tacles", matchStat.away_team_statistics.tackles],
                    [matchStat.home_team_statistics.clearances, "Dégagements", matchStat.away_team_statistics.clearances],
                    [matchStat.home_team_statistics.fouls_committed, "Fautes", matchStat.away_team_statistics.fouls_committed],
                    [matchStat.home_team_statistics.yellow_cards, "Carton jaune", matchStat.away_team_statistics.yellow_cards],
                    [matchStat.home_team_statistics.red_cards, "Carton rouge", matchStat.away_team_statistics.red_cards],
                ];
                let tableOutput = table(tableStat);
                console.log(tableOutput);
                console.log(tableOutput.length);
                resolve(this.computeGoalsString(matchIndex)+'\n```\n'+tableOutput+'\n```')
            })
        })
        
    
    },

    sendMessage: function (message, channel = null){
        if(this.slackClient !== null){
            this.slackClient.sendMessage(message, channel ? channel : this.slackConversationId);
        }
        if(this.discordClient !== null){
            this.discordSubscribesChannels.forEach((channelId) => {
                this.discordClient.channels.get(channelId).send(message);
            })
        }
    }
};

footballLiveScore.start();
