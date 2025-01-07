const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const cors = require('cors');

app.use(cors());
app.use(express.json());

const games = new Map();

// Test endpoint
app.get('/api/test', (req, res) => {
    console.log('Test endpoint called');
    res.json({ status: 'Server is running!' });
});

// REST API endpoints
app.post('/api/games/create', (req, res) => {
    console.log('Create game request received');
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    games.set(gameId, {
        id: gameId,
        board: Array(3).fill(null).map(() => Array(3).fill('')),
        players: [],
        currentPlayer: null,
        isGameOver: false,
        winner: null
    });
    console.log('Game created with ID:', gameId);
    res.json({ gameId });
});

app.post('/api/games/join', (req, res) => {
    console.log('Join game request received:', req.body);
    const { gameId } = req.body;
    const game = games.get(gameId);
    
    if (!game) {
        console.log('Game not found:', gameId);
        return res.status(404).json({ success: false, error: 'Game not found' });
    }
    
    if (game.players.length >= 2) {
        console.log('Game is full:', gameId);
        return res.status(400).json({ success: false, error: 'Game is full' });
    }
    
    console.log('Successfully joined game:', gameId);
    res.json({ success: true });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinGame', (data) => {
        const { gameId, playerName } = data;
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }
        
        if (game.players.length >= 2) {
            socket.emit('error', 'Game is full');
            return;
        }
        
        // Join the game room
        socket.join(gameId);
        
        // Add player to the game
        game.players.push({
            id: socket.id,
            name: playerName,
            symbol: game.players.length === 0 ? 'X' : 'O'
        });
        
        // Assign symbol to the player
        socket.emit('playerAssigned', {
            symbol: game.players[game.players.length - 1].symbol
        });

        // Notify host that player joined
        if (game.players.length === 2) {
            io.to(gameId).emit('playerJoined', {
                gameId: gameId,
                playerName: playerName
            });
            
            // Start the game
            game.currentPlayer = game.players[0].id;
            io.to(gameId).emit('gameStart', {
                players: game.players,
                currentPlayer: game.currentPlayer,
                board: game.board
            });
        }
    });

    socket.on('makeMove', (data) => {
        const { gameId, row, col } = data;
        const game = games.get(gameId);
        
        if (!game || game.isGameOver) return;
        
        const player = game.players.find(p => p.id === socket.id);
        if (!player || game.currentPlayer !== socket.id) return;
        
        if (game.board[row][col] !== '') return;
        
        // Make the move
        game.board[row][col] = player.symbol;
        
        // Check for win
        if (checkWin(game.board, player.symbol)) {
            game.isGameOver = true;
            game.winner = player.name;
            io.to(gameId).emit('gameUpdate', {
                board: game.board,
                currentPlayer: game.currentPlayer,
                isGameOver: true,
                winner: player.name
            });
            return;
        }
        
        // Check for draw
        if (checkDraw(game.board)) {
            game.isGameOver = true;
            io.to(gameId).emit('gameUpdate', {
                board: game.board,
                currentPlayer: game.currentPlayer,
                isGameOver: true,
                winner: null
            });
            return;
        }
        
        // Switch turns
        game.currentPlayer = game.players.find(p => p.id !== socket.id).id;
        
        // Emit game update
        io.to(gameId).emit('gameUpdate', {
            board: game.board,
            currentPlayer: game.currentPlayer,
            isGameOver: false,
            winner: null
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find and clean up any games this player was in
        for (const [gameId, game] of games.entries()) {
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                game.players.splice(playerIndex, 1);
                io.to(gameId).emit('playerLeft', {
                    message: 'Opponent left the game'
                });
                games.delete(gameId);
            }
        }
    });
});

function checkWin(board, symbol) {
    // Check rows
    for (let i = 0; i < 3; i++) {
        if (board[i][0] === symbol && board[i][1] === symbol && board[i][2] === symbol) {
            return true;
        }
    }
    
    // Check columns
    for (let j = 0; j < 3; j++) {
        if (board[0][j] === symbol && board[1][j] === symbol && board[2][j] === symbol) {
            return true;
        }
    }
    
    // Check diagonals
    if (board[0][0] === symbol && board[1][1] === symbol && board[2][2] === symbol) {
        return true;
    }
    if (board[0][2] === symbol && board[1][1] === symbol && board[2][0] === symbol) {
        return true;
    }
    
    return false;
}

function checkDraw(board) {
    return board.every(row => row.every(cell => cell !== ''));
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test the server by visiting: http://localhost:${PORT}/api/test`);
});
