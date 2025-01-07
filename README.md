# TicTacToe Game Server

This is a simple server for the TicTacToe game that handles online multiplayer functionality.

## Setup Instructions

1. Make sure you have Node.js installed on your computer
2. Open a terminal in this directory
3. Run `npm install` to install dependencies
4. Run `npm start` to start the server
5. The server will run on port 3000

## Testing the App

1. Start the server by following the setup instructions above
2. Run the Android app in an emulator
3. Create a new online game in the app
4. Use another emulator or device to join the game using the game code

## API Endpoints

- POST `/api/games/create` - Create a new game
- POST `/api/games/join` - Join an existing game

## WebSocket Events

- `joinGame` - Join a game room
- `makeMove` - Make a move in the game
- `playerAssigned` - Receive player symbol (X or O)
- `gameStart` - Game is ready to start
- `gameUpdate` - Receive game state updates
- `playerLeft` - Opponent left the game
- `error` - Error messages
