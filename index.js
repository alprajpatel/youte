
const express = require('express');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const port = 3000;

const USERS_FILE = path.join(__dirname, 'users.json');
let users = {}; // In-memory store for users

// Function to load users from file
function loadUsers() {
    if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        users = JSON.parse(data);
        console.log('Users loaded from file.');
    } else {
        console.log('No users file found. Starting with empty users.');
    }
}

// Function to save users to file
function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log('Users saved to file.');
}

// Load users when server starts
loadUsers();

const PLAYLIST_FILE = path.join(__dirname, 'playlists.json');
let allPlaylists = {}; // This will hold all playlists, keyed by name

const cache = {
    searches: {},
    streams: {}
}; // In-memory cache for searches and streams

// Function to load playlists from file
function loadPlaylists() {
    if (fs.existsSync(PLAYLIST_FILE)) {
        const data = fs.readFileSync(PLAYLIST_FILE, 'utf8');
        allPlaylists = JSON.parse(data);
        console.log('Playlists loaded from file.');
    } else {
        console.log('No playlist file found. Starting with empty playlists.');
        allPlaylists['Default Playlist'] = []; // Create a default playlist
        savePlaylists();
    }
}

// Function to save playlists to file
function savePlaylists() {
    fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(allPlaylists, null, 2), 'utf8');
    console.log('Playlists saved to file.');
}

// Load playlists when server starts
loadPlaylists();

app.use(express.static('public'));
app.use(express.json()); // Enable JSON body parsing

app.use(session({
    secret: 'your_secret_key', // Replace with a strong secret in production
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Authentication API
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (users[username]) {
        return res.status(409).json({ error: 'Username already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
    users[username] = { password: hashedPassword };
    saveUsers();
    res.status(201).json({ message: 'User registered successfully.' });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = users[username];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (user && passwordMatch) {
        req.session.user = { username };
        res.json({ message: 'Logged in successfully.', username });
    } else {
        res.status(401).json({ error: 'Invalid username or password.' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.json({ message: 'Logged out successfully.' });
    });
});

app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ isAuthenticated: true, username: req.session.user.username });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// Playlist API
app.get('/playlists', isAuthenticated, (req, res) => {
    res.json(Object.keys(allPlaylists));
});

app.post('/playlists/create', isAuthenticated, (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Playlist name is required.' });
    }
    if (allPlaylists[name]) {
        return res.status(409).json({ error: 'Playlist with this name already exists.' });
    }
    allPlaylists[name] = [];
    savePlaylists();
    res.json({ message: `Playlist '${name}' created.` });
});

app.get('/playlist', isAuthenticated, (req, res) => {
    const playlistName = req.query.name || 'Default Playlist';
    const playlist = allPlaylists[playlistName];
    if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found.' });
    }
    res.json(playlist);
});

app.post('/playlist/add', isAuthenticated, (req, res) => {
    const { playlistName, song } = req.body;
    if (!playlistName || !song || !song.id) {
        return res.status(400).json({ error: 'Playlist name and valid song data are required.' });
    }
    if (!allPlaylists[playlistName]) {
        return res.status(404).json({ error: 'Playlist not found.' });
    }
    if (!allPlaylists[playlistName].find(s => s.id === song.id)) {
        allPlaylists[playlistName].push(song);
        savePlaylists();
    }
    res.json(allPlaylists[playlistName]);
});

app.post('/playlist/remove', isAuthenticated, (req, res) => {
    const { playlistName, id } = req.body;
    if (!playlistName || !id) {
        return res.status(400).json({ error: 'Playlist name and song ID are required.' });
    }
    if (!allPlaylists[playlistName]) {
        return res.status(404).json({ error: 'Playlist not found.' });
    }
    const initialLength = allPlaylists[playlistName].length;
    allPlaylists[playlistName] = allPlaylists[playlistName].filter(s => s.id !== id);
    if (allPlaylists[playlistName].length < initialLength) {
        savePlaylists();
    }
    res.json(allPlaylists[playlistName]);
});

app.post('/playlist/clear', isAuthenticated, (req, res) => {
    const { playlistName } = req.body;
    if (!playlistName) {
        return res.status(400).json({ error: 'Playlist name is required.' });
    }
    if (!allPlaylists[playlistName]) {
        return res.status(404).json({ error: 'Playlist not found.' });
    }
    allPlaylists[playlistName] = [];
    savePlaylists();
    res.json([]);
});

app.post('/playlist/reorder', isAuthenticated, (req, res) => {
    const { playlistName, newOrderIds } = req.body; // Array of song IDs in new order
    if (!playlistName || !Array.isArray(newOrderIds)) {
        return res.status(400).json({ error: 'Playlist name and valid reorder data are required.' });
    }
    if (!allPlaylists[playlistName]) {
        return res.status(404).json({ error: 'Playlist not found.' });
    }

    const reorderedPlaylist = [];
    for (const id of newOrderIds) {
        const song = allPlaylists[playlistName].find(s => s.id === id);
        if (song) {
            reorderedPlaylist.push(song);
        }
    }
    allPlaylists[playlistName] = reorderedPlaylist;
    savePlaylists();
    res.json(allPlaylists[playlistName]);
});

// Thumbnail proxy endpoint
app.get('/thumbnail', isAuthenticated, (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('Image URL is required');
    }

    const protocol = imageUrl.startsWith('https') ? require('https') : require('http');
    protocol.get(imageUrl, (proxyRes) => {
        proxyRes.pipe(res);
    }).on('error', (e) => {
        console.error(`Error proxying image: ${e.message}`);
        res.status(500).send('Error proxying image');
    });
});

app.get('/search', isAuthenticated, (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        if (cache.searches[query]) {
            console.log(`Serving search results for "${query}" from cache.`);
            return res.json(cache.searches[query]);
        }

        console.log(`Performing live search for "${query}".`);
        const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
        const ytdlp = spawn(ytdlpPath, [
            '--quiet',
            '--dump-json',
            '--flat-playlist',
            `ytsearch10:${query}`
        ]);

        let output = '';
        ytdlp.stdout.on('data', (data) => {
            output += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
            console.error(`yt-dlp stderr: ${data}`);
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                console.log(`yt-dlp process exited with code ${code}`);
                return res.status(500).json({ error: 'Failed to search for videos.' });
            }
            try {
                const results = output.trim().split('\n').map(line => JSON.parse(line));
                const formattedResults = results.map(video => ({
                    id: video.id,
                    url: video.url,
                    title: video.title,
                    durationFormatted: new Date(video.duration * 1000).toISOString().substr(11, 8),
                    channel: { name: video.uploader },
                    thumbnail: { url: video.thumbnails.find(t => t.width === 120)?.url || video.thumbnails[0]?.url }
                }));
                
                // Store results in cache
                cache.searches[query] = formattedResults;
                console.log(`Cached search results for "${query}".`);

                res.json(formattedResults);
            } catch (e) {
                console.error('Error parsing yt-dlp output:', e);
                res.status(500).json({ error: 'Error parsing search results.' });
            }
        });

    } catch (error) {
        console.error('--- DETAILED SEARCH ERROR ---');
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
        console.error("-----------------------------");
        res.status(500).json({ error: 'Error searching for videos', details: { message: error.message, stack: error.stack } });
    }
});

app.get('/play', isAuthenticated, (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).send('Video URL is required');
        }

        // Check cache first
        if (cache.streams[videoUrl]) {
            console.log(`Serving stream for "${videoUrl}" from cache.`);
            return res.redirect(cache.streams[videoUrl]);
        }

        console.log(`Fetching direct stream URL for "${videoUrl}".`);
        const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
        const ytdlp = spawn(ytdlpPath, [
            '--quiet',
            '--get-url',
            '--format', 'bestaudio',
            videoUrl
        ]);

        let streamUrl = '';
        ytdlp.stdout.on('data', (data) => {
            streamUrl += data.toString().trim();
        });

        ytdlp.stderr.on('data', (data) => {
            console.error(`yt-dlp stderr: ${data}`);
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                console.log(`yt-dlp process exited with code ${code}`);
                return res.status(500).send('Error fetching stream URL.');
            }
            if (streamUrl) {
                cache.streams[videoUrl] = streamUrl;
                console.log(`Cached stream URL for "${videoUrl}".`);
                res.redirect(streamUrl);
            } else {
                res.status(500).send('Could not get stream URL.');
            }
        });

    } catch (error) {
        console.error('Playback Error:', error);
        res.status(500).send('Error playing audio');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
