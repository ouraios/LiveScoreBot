# LiveScoreBot

This bot was developed to follow in real time scores of matches of the Football World Cup 2018. For now it only supports listening to match for this competition. Its all in french for now.

# Supported commands for the bot

* `!livescore` : Give the current score of a match which is happening
* `!livescore stats` : Give stats about the current match if there's one. Or it will give stats of the last match.
* `!livescore list` : List all the finished matches of the competition with an number id for each match that you can use on the next command.
* `!livescore stats <IdNumber of match>` : Will give the stats of the provided match id.
* `!livescore subscribe` **Discord only** : Will the subscribe the current channel for realtime notifications of events in a match.
* `!livescore unsubscribe` **Discord only** : Will unsubscribe the channel if it was subribed to realtime match events.

# How to use ?

```bash
npm i
# For slack
node index.js --slackToken=<YourSlackBotToken> --slackConversationId=<SlackConcersationId> 
# For Discord
node index.js --discordToken=<YourDiscordApplicationToken> 
```

# TODOS : 
* Add features to choose the competition to watch
* Add i18n support