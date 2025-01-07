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

// In-memory game state (Note: This will reset on serverless function cold starts)
const games = new Map();

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('Health check endpoint called');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Create game endpoint
app.post('/api/games/create', (req, res) => {
    try {
        console.log('Create game request received');
        const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
        games.set(gameId, {
            id: gameId,
            board: Array(3).fill(null).map(() => Array(3).fill('')),
            players: [],
            currentPlayer: null,
            isGameOver: false,
            winner: null,
            lastActivity: new Date().toISOString()
        });
        console.log('Game created with ID:', gameId);
        res.json({ success: true, gameId });
    } catch (error) {
        console.error('Error creating game:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Join game endpoint
app.post('/api/games/join', (req, res) => {
    try {
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
        
        game.lastActivity = new Date().toISOString();
        res.json({ success: true, gameId });
    } catch (error) {
        console.error('Error joining game:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentGameId = null;

    socket.on('joinGame', (data) => {
        try {
            const { gameId, playerName } = data;
            currentGameId = gameId;
            const game = games.get(gameId);
            
            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }

            if (game.players.length < 2) {
                game.players.push({
                    id: socket.id,
                    name: playerName,
                    symbol: game.players.length === 0 ? 'X' : 'O'
                });
                
                socket.join(gameId);
                
                if (game.players.length === 2) {
                    game.currentPlayer = game.players[0].id;
                    io.to(gameId).emit('gameStart', {
                        board: game.board,
                        players: game.players,
                        currentPlayer: game.currentPlayer
                    });
                }
            }
            
            game.lastActivity = new Date().toISOString();
        } catch (error) {
            console.error('Error in joinGame:', error);
            socket.emit('error', 'Internal server error');
        }
    });

    socket.on('makeMove', (data) => {
        try {
            const { gameId, row, col } = data;
            const game = games.get(gameId);
            
            if (!game || game.isGameOver || socket.id !== game.currentPlayer || game.board[row][col] !== '') {
                return;
            }
            
            const player = game.players.find(p => p.id === socket.id);
            game.board[row][col] = player.symbol;
            
            if (checkWin(game.board, player.symbol)) {
                game.isGameOver = true;
                game.winner = player.id;
                io.to(gameId).emit('gameOver', {
                    board: game.board,
                    winner: player.name
                });
            } else if (checkDraw(game.board)) {
                game.isGameOver = true;
                io.to(gameId).emit('gameOver', {
                    board: game.board,
                    winner: null
                });
            } else {
                game.currentPlayer = game.players.find(p => p.id !== socket.id).id;
                io.to(gameId).emit('gameUpdate', {
                    board: game.board,
                    currentPlayer: game.currentPlayer
                });
            }
            
            game.lastActivity = new Date().toISOString();
        } catch (error) {
            console.error('Error in makeMove:', error);
            socket.emit('error', 'Internal server error');
        }
    });

    socket.on('disconnect', () => {
        try {
            console.log('User disconnected:', socket.id);
            if (currentGameId) {
                const game = games.get(currentGameId);
                if (game) {
                    game.isGameOver = true;
                    const remainingPlayer = game.players.find(p => p.id !== socket.id);
                    if (remainingPlayer) {
                        io.to(currentGameId).emit('playerDisconnected', {
                            message: 'Opponent disconnected',
                            winner: remainingPlayer.name
                        });
                    }
                    games.delete(currentGameId);
                }
            }
        } catch (error) {
            console.error('Error in disconnect handler:', error);
        }
    });
});

// Helper function to check for a win
function checkWin(board, symbol) {
    // Check rows
    for (let i = 0; i < 3; i++) {
        if (board[i][0] === symbol && board[i][1] === symbol && board[i][2] === symbol) {
            return true;
        }
    }
    
    // Check columns
    for (let i = 0; i < 3; i++) {
        if (board[0][i] === symbol && board[1][i] === symbol && board[2][i] === symbol) {
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

// Helper function to check for a draw
function checkDraw(board) {
    return board.every(row => row.every(cell => cell !== ''));
}

// Clean up inactive games periodically (every 30 minutes)
setInterval(() => {
    const now = new Date();
    for (const [gameId, game] of games.entries()) {
        const lastActivity = new Date(game.lastActivity);
        if (now - lastActivity > 30 * 60 * 1000) { // 30 minutes
            games.delete(gameId);
            console.log('Cleaned up inactive game:', gameId);
        }
    }
}, 30 * 60 * 1000);

// Start the server
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    http.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Test the server at: http://localhost:${PORT}/api/health`);
    });
}

// Export the app for serverless deployment
module.exports = http;
