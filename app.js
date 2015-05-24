require('dotenv').load();

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var irc = require('twitch-irc');
app.use(express.static(__dirname + '/public'));

io.configure('production', function(){
  io.enable('browser client minification');  // send minified client
  io.enable('browser client etag');          // apply etag caching logic based on version number
  io.enable('browser client gzip');          // gzip the file
  io.set('log level', 1);                    // reduce logging
  // enable all transports (optional if you want flashsocket)
  io.set('transports', [ 'websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
});

var port = process.env.PORT || 8000;
server.listen(port);
console.log("Listening at port: " + port);

var clientOptions = {
    options: {
        debug: true,
        debugIgnore: ['ping', 'chat', 'action']
    },
    identity: {
        username: process.env.username,
        password: process.env.password
    },
    channels: ['legobaseball2']
}
var client = new irc.client(clientOptions);

client.connect();

client.addListener('chat', function (channel, user, message) {
    console.log(message);
    switch(message.toLowerCase()) {
      case 'up':
        game.move(0);
        dir = 0;
        break;
      case 'right':
        game.move(1);
        dir = 1;
        break;
      case 'down':
        game.move(2);
        dir = 2;
        break;
      case 'left':
        game.move(3);
        dir = 3;
        break;
    }
    if (typeof dir !== 'undefined') {
      var gameData = game.getGameData();
      var data = {
        direction: dir,
        userId: "",
        numUsers: io.sockets.clients().length,
        gameData: gameData
      };
      if (gameData.over || gameData.won) {
          game.restart(function () {
            var data = game.getGameData();
            data.highscores = game.getHighscores();
            io.sockets.emit('restart', data);
          });
      }
      io.sockets.emit('move', data);
    }
});

app.get('*', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// Setup game
var nextUserId = 0;
var moveCount = 0;
var game = require('./private/js/game');

var voted = false;
var ids = [];

io.sockets.on('connection', function (socket) {
  socket.userId = ++nextUserId;

  // When connecting
  var gameData = game.getGameData();
  var data = {
    userId: socket.userId,
    gameData: gameData,
    numUsers: io.sockets.clients().length,
    highscores: game.getHighscores()
  };
  socket.emit('connected', data);
  socket.broadcast.emit('someone connected', {
    numUsers: io.sockets.clients().length
  });

  // When someone moves
  var numMovesPerSecond = 2;
  var pastEvents = [];
  for (var i = 0; i < numMovesPerSecond; i++) {
    pastEvents.push(0);
  }
  socket.on('move', function (direction) {
      ++moveCount;
      // update the game
      game.move(direction);

      // Send the move with the game state
      var gameData = game.getGameData();
      var data = {
        direction: direction,
        from: socket.from,
        userId: socket.userId,
        numUsers: io.sockets.clients().length,
        gameData: gameData
      };
      io.sockets.emit('move', data);

      // Reset the game if it is game over or won
      if (gameData.over || gameData.won) {
        game.restart(function () {
          var data = game.getGameData();
          data.highscores = game.getHighscores();
          io.sockets.emit('restart', data);
        });
      }
  });

  socket.on('disconnect', function () {
    io.sockets.emit('someone disconnected', {
      numUsers: io.sockets.clients().length,
    });
  });
});
