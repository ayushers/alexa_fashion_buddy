/**
    Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

    Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

        http://aws.amazon.com/apache2.0/

    or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

'use strict';
var textHelper = require('./textHelper'),
    storage = require('./storage'),
    https = require('https');

/**
 * Variable defining the length of the delimiter between events
 */
var delimiterSize = 2;

function parseJson(inputText) {
    // sizeOf (/nEvents/n) is 10
    var text = inputText.substring(inputText.indexOf("\\nEvents\\n")+10, inputText.indexOf("\\n\\n\\nBirths")),
        retArr = [],
        retString = "",
        endIndex,
        startIndex = 0;

    if (text.length == 0) {
        return retArr;
    }

    while(true) {
        endIndex = text.indexOf("\\n", startIndex+delimiterSize);
        var eventText = (endIndex == -1 ? text.substring(startIndex) : text.substring(startIndex, endIndex));
        // replace dashes returned in text from Wikipedia's API
        eventText = eventText.replace(/\\u2013\s*/g, '');
        // add comma after year so Alexa pauses before continuing with the sentence
        eventText = eventText.replace(/(^\d+)/,'$1,');
        eventText = 'In ' + eventText;
        startIndex = endIndex+delimiterSize;
        retArr.push(eventText);
        if (endIndex == -1) {
            break;
        }
    }
    if (retString != "") {
        retArr.push(retString);
    }
    retArr.reverse();
    return retArr;
}

function getJsonEvents(eventCallback) {
    var url = "https://api.forecast.io/forecast/1f9956ae5f61d24b00d29d7755f2373d/42.7285,-84.4822";

    https.get(url, function(res) {
        var body = '';

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            var stringResult = JSON.parse(body);
            console.log('---------------------PRINTING--------------');
            console.log(stringResult.currently);
            eventCallback(stringResult);
        });
    }).on('error', function (e) {
        console.log("Got error: ", e);
    });
}

var registerIntentHandlers = function (intentHandlers, skillContext) {

    // done editing
    intentHandlers.NewGameIntent = function (intent, session, response) {
        //reset scores for all existing players
        storage.loadGame(session, function (currentGame) {
            if (currentGame.data.players.length === 0) {
                response.ask('You have no clothes. Please add an article of clothing.', 'Do I need to remind you that you have no clothes?');
                return;
            }
            currentGame.data.players.forEach(function (player) {
                currentGame.data.scores[player] = -20;
                currentGame.data.max[player] = 150;
            });
            currentGame.save(function () {
                var speechOutput = 'Wardrobe started with '
                    + currentGame.data.players.length + ' existing article';
                if (currentGame.data.players.length != 1) {
                    speechOutput += 's';
                }
                speechOutput += '.';
                if (skillContext.needMoreHelp) {
                    speechOutput += '. You can set the minimum and maximum temperature of your clothes or add another article of clothing. What would you like?';
                    var repromptText = 'Set the minimum and maximum temperature of your clothes or add another article of clothing! What would you like?';
                    response.ask(speechOutput, repromptText);
                } else {
                    response.tell(speechOutput);
                }
            });
        });
    };

    // done editing
    intentHandlers.AddPlayerIntent = function (intent, session, response) {
        //add a player to the current game,
        //terminate or continue the conversation based on whether the intent
        //is from a one shot command or not.
        var newPlayerName = textHelper.getPlayerName(intent.slots.PlayerName.value);
        if (!newPlayerName) {
            response.ask('OK. What do you want to add?', 'What do you want to add?');
            return;
        }
        storage.loadGame(session, function (currentGame) {
            var speechOutput,
                reprompt;
            if (currentGame.data.scores[newPlayerName] !== undefined) {
                speechOutput = newPlayerName + ' has already been added to your Wardrobe.';
                if (skillContext.needMoreHelp) {
                    response.ask(speechOutput + ' What else?', 'What else?');
                } else {
                    response.tell(speechOutput);
                }
                return;
            }
            speechOutput = newPlayerName + ' has been added to your Wardrobe. ';
            currentGame.data.players.push(newPlayerName);

            currentGame.data.scores[newPlayerName] = 0;
            currentGame.data.max[newPlayerName] = 150;
            if (skillContext.needMoreHelp) {
                if (currentGame.data.players.length == 1) {
                    speechOutput += 'You can say, "stop" to complete your wardrobe. Now what\'s your next article of clothing?';
                    reprompt = textHelper.nextHelp;
                } else {
                    speechOutput += 'What is your next article of clothing?';
                    reprompt = textHelper.nextHelp;
                }
            }
            currentGame.save(function () {
                if (reprompt) {
                    response.ask(speechOutput, reprompt);
                } else {
                    response.tell(speechOutput);
                }
            });
        });
    };

        // done editing
    intentHandlers.AddScoreIntent = function (intent, session, response) {
        //give a player points, ask additional question if slot values are missing.
        var playerName = textHelper.getPlayerName(intent.slots.PlayerName.value),
            score = intent.slots.ScoreNumber,
            negscore = intent.slots.negScoreNumber,
            scoreValue = parseInt(score.value),
            negscoreValue = parseInt(negscore.value);
        if (!isNaN(negscoreValue)){
            scoreValue = 0-negscoreValue;
        }
        if (!playerName) {
            response.ask('sorry, I did not hear the clothing name, please say that again', 'Please add the article again.');
            return;
        }
        if (isNaN(scoreValue)) {
            console.log('Invalid minimum temperature value = ' + score.value);
            response.ask('sorry, I did not hear the temperature, please say that again', 'please say the minimum temperature again');
            return;
        }
        storage.loadGame(session, function (currentGame) {
            var targetPlayer, speechOutput = '', newScore;
            if (currentGame.data.players.length < 1) {
                response.ask('sorry, your Wardrobe is empty, what can I do for you?', 'what can I do for you?');
                return;
            }
            for (var i = 0; i < currentGame.data.players.length; i++) {
                if (currentGame.data.players[i] === playerName) {
                    targetPlayer = currentGame.data.players[i];
                    break;
                }
            }
            if (!targetPlayer) {
                response.ask('Sorry, ' + playerName + ' has not been added to your Wardrobe. What else?', playerName + ' has not been added to your Wardrobe. What else?');
                return;
            }
           
            currentGame.data.scores[targetPlayer] = scoreValue;

            speechOutput += scoreValue + ' degrees for ' + targetPlayer + ' is set as the minimum. ';
            currentGame.save(function () {
                response.tell(speechOutput);
            });
        });
    };

    // done editing
    intentHandlers.AddMaxIntent = function (intent, session, response) {
        //give a player points, ask additional question if slot values are missing.
        var playerName = textHelper.getPlayerName(intent.slots.PlayerName.value),
            max = intent.slots.MaxNumber,
            negmax = intent.slots.negMaxNumber,
            maxValue = parseInt(max.value),
            negmaxValue = parseInt(negmax.value);
        if (!isNaN(negmaxValue)){
            maxValue = 0-negmaxValue;
        }
        if (!playerName) {
            response.ask('sorry, I did not hear the clothing name, please say that again', 'Please say the clothing name again');
            return;
        }
        if (isNaN(maxValue)) {
            console.log('Invalid maximum temperature value = ' + max.value);
            response.ask('sorry, I did not hear the temperature, please say that again', 'please say the maximum temperature again');
            return;
        }
        storage.loadGame(session, function (currentGame) {
            var targetPlayer, speechOutput = '', newMax;
            if (currentGame.data.players.length < 1) {
                response.ask('sorry, your Wardrobe is empty, what can I do for you?', 'what can I do for you?');
                return;
            }
            for (var i = 0; i < currentGame.data.players.length; i++) {
                if (currentGame.data.players[i] === playerName) {
                    targetPlayer = currentGame.data.players[i];
                    break;
                }
            }
            if (!targetPlayer) {
                response.ask('Sorry, ' + playerName + ' has not been added to your Wardrobe. What else?', playerName + ' has not been added to your Wardrobe. What else?');
                return;
            }
           
            currentGame.data.max[targetPlayer] = maxValue;

            speechOutput += maxValue + ' degrees for ' + targetPlayer + ' is set as the maximum. ';
            currentGame.save(function () {
                response.tell(speechOutput);
            });
        });
    };

    //done editing
    intentHandlers.TellOutfitIntent = function (intent, session, response) {
        storage.loadGame(session, function (currentGame) {
            var QArticles = [],
                continueSession,
                speechOutput = '',
                outfit = '',
                _actualTemp,
                _precipProb,
                _cloudCover;

            getJsonEvents( function (events) {
                if (currentGame.data.players.length === 0) {
                    response.tell('There are no articles of clothing in your Wardrobe');
                    return;
                }

                _actualTemp = events.currently.temperature;
                _precipProb = events.daily.data[0].precipProbability;
                _cloudCover = events.daily.data[0].cloudCover;

                currentGame.data.players.forEach(function (article, index) {
                    if (currentGame.data.scores[article]<=_actualTemp && currentGame.data.max[article]>=_actualTemp){
                        QArticles.push(article);
                        //console.log(article);
                    }
                    else{
                        //console.log('false');
                    }
                });

                var rand_i = Math.floor(Math.random() * QArticles.length);

                console.log(rand_i);

                var _art = QArticles[rand_i];
                var _min = currentGame.data.scores[_art];
                var _max = currentGame.data.max[_art];

                speechOutput += 'You should probably wear '
                if (_art != 'pants' || _art != 'shorts' || _art != 'underwear'){
                    speechOutput += 'a ';
                }
                speechOutput += _art + ' because the temperature is ' + _actualTemp + ' degrees';
                outfit = 'Wear: ' + _art + '\n Current Temp: ' + _actualTemp + ' deg F \n';

                if (_art == 'cardigan'){
                    speechOutput+=' and it\'s in style!';
                }
                if (_art == 'underwear'){
                    speechOutput += ' wellll. I shouldn\'t have to tell you to wear that; ';
                }
                if (_precipProb>.5){
                    speechOutput += ' There\'s a high chance of rain. You may want to bring an umbrella.';
                    outfit += '\n Chance of Rain: '+(_precipProb*100)+'%\t -Bring umbrella';
                }
                if (_cloudCover<.2){
                    speechOutput += ' Clear skies! Wear sunglasses!';
                    outfit += '\n Cloud Cover: '+(_cloudCover*100)+'%\t -Take sunglasses';
                }

                response.tellWithCard(speechOutput, 'WEAR THIS!', outfit);
            });           
        });
    };

    intentHandlers.GoGreen = function (intent, session, response) {
        storage.loadGame(session, function (currentGame) {

            response.tell('Its always a good idea to rep the M.S.U. Spartans. Go Green!');
        });
    };

    intentHandlers.ResetPlayersIntent = function (intent, session, response) {
        //remove all players
        storage.newGame(session).save(function () {
            response.ask('New Wardrobe, what articles of clothing do you want to add first?', 'What do you want to add first?');
        });
    };

    intentHandlers['AMAZON.HelpIntent'] = function (intent, session, response) {
        var speechOutput = textHelper.completeHelp;
        if (skillContext.needMoreHelp) {
            response.ask(textHelper.completeHelp + ' So, how can I help?', 'How can I help?');
        } else {
            response.tell(textHelper.completeHelp);
        }
    };

    intentHandlers['AMAZON.CancelIntent'] = function (intent, session, response) {
        if (skillContext.needMoreHelp) {
            response.tell('Cancelled.');
        } else {
            response.tell('');
        }
    };

    intentHandlers['AMAZON.StopIntent'] = function (intent, session, response) {
        if (skillContext.needMoreHelp) {
            response.tell('Stopping.');
        } else {
            response.tell('');
        }
    };
};
exports.register = registerIntentHandlers;
