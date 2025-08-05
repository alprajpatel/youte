
const App = () => {
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState([]);
    const [playlist, setPlaylist] = React.useState([]);
    const [allPlaylistNames, setAllPlaylistNames] = React.useState([]);
    const [selectedPlaylist, setSelectedPlaylist] = React.useState('Default Playlist');
    const [newPlaylistName, setNewPlaylistName] = React.useState('');

    const [isAuthenticated, setIsAuthenticated] = React.useState(false);
    const [username, setUsername] = React.useState('');
    const [authMessage, setAuthMessage] = React.useState('');
    const [authUsername, setAuthUsername] = React.useState('');
    const [authPassword, setAuthPassword] = React.useState('');

    React.useEffect(() => {
        const checkAuth = async () => {
            const res = await fetch('/check-auth');
            const data = await res.json();
            setIsAuthenticated(data.isAuthenticated);
            if (data.isAuthenticated) {
                setUsername(data.username);
            }
        };

        const fetchPlaylists = async () => {
            const namesRes = await fetch('/playlists');
            const namesData = await namesRes.json();
            setAllPlaylistNames(namesData);

            const playlistRes = await fetch(`/playlist?name=${encodeURIComponent(selectedPlaylist)}`);
            const playlistData = await playlistRes.json();
            setPlaylist(playlistData);
        };

        checkAuth();
        fetchPlaylists();
    }, [selectedPlaylist]);
    const [currentTrack, setCurrentTrack] = React.useState(null);
    const [volume, setVolume] = React.useState(1);
    const [seekTime, setSeekTime] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const audioRef = React.useRef(null);

    const dragItem = React.useRef(null);
    const dragOverItem = React.useRef(null);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query) return;
        const res = await fetch(`/search?q=${query}`);
        const data = await res.json();
        if (data.error) {
            console.error('Search Error:', data.error);
            if (data.details) {
                console.error('Search Error Details:', data.details);
            }
            setResults([]);
        } else {
            setResults(data);
        }
    };

    const selectAndPlaySong = async (video) => {
        // Add to playlist via backend
        const addRes = await fetch('/playlist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistName: selectedPlaylist, song: video })
        });
        const updatedPlaylist = await addRes.json();
        setPlaylist(updatedPlaylist);
        
        // Immediately play the track
        playTrack(video);
    };

    const playTrack = (video) => {
        console.log('Frontend: Video object for playback:', video); // Frontend Debugging
        const audioSrc = `/play?url=${encodeURIComponent(video.url)}`;
        console.log('Frontend: Generated Audio Source URL:', audioSrc); // Frontend Debugging
        setCurrentTrack(video);
        if (audioRef.current) {
            audioRef.current.src = audioSrc;
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const playNext = () => {
        if (!currentTrack) return;
        const currentIndex = playlist.findIndex(item => item.id === currentTrack.id);
        const nextIndex = (currentIndex + 1) % playlist.length;
        if (playlist[nextIndex]) {
            playTrack(playlist[nextIndex]);
        } else {
            audioRef.current.pause();
            setCurrentTrack(null);
            setIsPlaying(false);
        }
    };

    const togglePlayPause = () => {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeekChange = (e) => {
        const seekTo = e.target.value;
        audioRef.current.currentTime = seekTo;
        setSeekTime(seekTo);
    };

    const handleVolumeChange = (e) => {
        const newVolume = e.target.value;
        audioRef.current.volume = newVolume;
        setVolume(newVolume);
    };

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const removeFromPlaylist = async (id) => {
        const removeRes = await fetch('/playlist/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistName: selectedPlaylist, id })
        });
        const updatedPlaylist = await removeRes.json();
        setPlaylist(updatedPlaylist);

        // If the removed song was the current track, stop playback
        if (currentTrack && currentTrack.id === id) {
            audioRef.current.pause();
            setCurrentTrack(null);
            setIsPlaying(false);
        }
    };

    const clearPlaylist = async () => {
        await fetch('/playlist/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistName: selectedPlaylist })
        });
        setPlaylist([]);
        audioRef.current.pause();
        setCurrentTrack(null);
        setIsPlaying(false);
    };

    const handleDragStart = (e, position) => {
        dragItem.current = position;
    };

    const handleDragEnter = (e, position) => {
        dragOverItem.current = position;
    };

    const handleDrop = async (e) => {
        const newPlaylist = [...playlist];
        const draggedItemContent = newPlaylist[dragItem.current];
        newPlaylist.splice(dragItem.current, 1);
        newPlaylist.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setPlaylist(newPlaylist);

        // Update backend
        await fetch('/playlist/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistName: selectedPlaylist, newOrderIds: newPlaylist.map(song => song.id) })
        });
    };

    const handleLogin = async () => {
        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: authUsername, password: authPassword })
        });
        const data = await res.json();
        if (res.ok) {
            setIsAuthenticated(true);
            setUsername(data.username);
            setAuthMessage('Logged in successfully!');
        } else {
            setAuthMessage(data.error || 'Login failed.');
        }
    };

    const handleRegister = async () => {
        const res = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: authUsername, password: authPassword })
        });
        const data = await res.json();
        if (res.ok) {
            setAuthMessage('Registered successfully! Please log in.');
        } else {
            setAuthMessage(data.error || 'Registration failed.');
        }
    };

    const handleLogout = async () => {
        const res = await fetch('/logout', { method: 'POST' });
        if (res.ok) {
            setIsAuthenticated(false);
            setUsername('');
            setAuthMessage('Logged out.');
            setPlaylist([]); // Clear playlist on logout
            setAllPlaylistNames([]);
            setSelectedPlaylist('Default Playlist');
            setCurrentTrack(null);
        } else {
            setAuthMessage('Logout failed.');
        }
    };

    const createNewPlaylist = async () => {
        if (!newPlaylistName) return;
        const res = await fetch('/playlists/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newPlaylistName })
        });
        const data = await res.json();
        if (data.error) {
            alert(data.error);
        } else {
            setNewPlaylistName('');
            const namesRes = await fetch('/playlists');
            const namesData = await namesRes.json();
            setAllPlaylistNames(namesData);
            setSelectedPlaylist(newPlaylistName); // Switch to new playlist
        }
    };

    

    return (
        <div className="container-fluid">
            {!isAuthenticated ? (
                <div className="auth-container">
                    <h2>Login / Register</h2>
                    <div className="form-group">
                        <input 
                            type="text" 
                            className="form-control mb-2" 
                            placeholder="Username" 
                            value={authUsername} 
                            onChange={(e) => setAuthUsername(e.target.value)}
                        />
                        <input 
                            type="password" 
                            className="form-control mb-2" 
                            placeholder="Password" 
                            value={authPassword} 
                            onChange={(e) => setAuthPassword(e.target.value)}
                        />
                        <button className="btn btn-primary mr-2" onClick={handleLogin}>Login</button>
                        <button className="btn btn-secondary" onClick={handleRegister}>Register</button>
                    </div>
                    {authMessage && <p className="mt-3">{authMessage}</p>}
                </div>
            ) : (
                <>
                    <div className="header-bar d-flex justify-content-between align-items-center mb-3">
                        <h2>Welcome, {username}!</h2>
                        <button className="btn btn-warning" onClick={handleLogout}>Logout</button>
                    </div>
                    <div className="row">
                        <div className="col-md-6">
                            <h2>Search</h2>
                            <form onSubmit={handleSearch} className="search-form">
                                <div className="input-group mb-3">
                                    <input 
                                        type="text" 
                                        className="form-control" 
                                        value={query} 
                                        onChange={(e) => setQuery(e.target.value)} 
                                        placeholder="Search for a song"
                                    />
                                    <div className="input-group-append">
                                        <button className="btn btn-primary" type="submit">Search</button>
                                    </div>
                                </div>
                            </form>
                            <div className="list-group">
                                {results.map(video => (
                                    <a href="#" key={video.id} className="list-group-item list-group-item-action d-flex align-items-center" onClick={() => selectAndPlaySong(video)}>
                                        <img src={video.thumbnail && video.thumbnail.url ? `/thumbnail?url=${encodeURIComponent(video.thumbnail.url)}` : 'https://via.placeholder.com/50?text=No+Image'} alt={video.title} className="mr-3" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                                        <div className="song-info flex-grow-1">
                                            <h5 className="mb-1">{video.title}</h5>
                                            <small>{video.channel.name} - {video.durationFormatted}</small>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                        <div className="col-md-6">
                            <h2>Playlist</h2>
                            <div className="playlist-management mb-3">
                                <div className="input-group mb-2">
                                    <input 
                                        type="text" 
                                        className="form-control" 
                                        placeholder="New playlist name" 
                                        value={newPlaylistName} 
                                        onChange={(e) => setNewPlaylistName(e.target.value)}
                                    />
                                    <div className="input-group-append">
                                        <button className="btn btn-primary" onClick={createNewPlaylist}>Create</button>
                                    </div>
                                </div>
                                <select 
                                    className="form-control mb-2" 
                                    value={selectedPlaylist} 
                                    onChange={(e) => setSelectedPlaylist(e.target.value)}
                                >
                                    {allPlaylistNames.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                                <div className="playlist-controls">
                                    <button className="btn btn-sm" onClick={clearPlaylist}>Clear Current Playlist</button>
                                </div>
                            </div>
                            <ul className="list-group">
                                {playlist.map((video, index) => (
                                    <li 
                                        key={video.id} 
                                        className={`list-group-item d-flex justify-content-between align-items-center ${currentTrack && currentTrack.id === video.id ? 'active' : ''}`}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragEnter={(e) => handleDragEnter(e, index)}
                                        onDragEnd={handleDrop}
                                        onDragOver={(e) => e.preventDefault()}
                                    >
                                        <img src={video.thumbnail && video.thumbnail.url ? `/thumbnail?url=${encodeURIComponent(video.thumbnail.url)}` : 'https://via.placeholder.com/50?text=No+Image'} alt={video.title} className="mr-3" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                                        <span onClick={() => playTrack(video)} style={{ cursor: 'pointer' }} className="song-info flex-grow-1">
                                            {index + 1}. {video.title}
                                        </span>
                                        <button className="btn btn-danger btn-sm" onClick={() => removeFromPlaylist(video.id)}>Remove</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {currentTrack && (
                        <div className="player-bar">
                            <div className="d-flex align-items-center">
                                <img src={currentTrack.thumbnail && currentTrack.thumbnail.url ? `/thumbnail?url=${encodeURIComponent(currentTrack.thumbnail.url)}` : 'https://via.placeholder.com/50?text=No+Image'} alt={currentTrack.title} width="50" height="50" className="mr-3"/>
                                <div>
                                    <h5>{currentTrack.title}</h5>
                                    <p className="mb-0">{currentTrack.channel.name}</p>
                                </div>
                            </div>
                            <div className="audio-controls d-flex flex-column align-items-center mx-auto">
                                <div className="d-flex align-items-center mb-2">
                                    <button onClick={() => playNext(true)}><i className="fas fa-step-backward"></i></button>
                                    <button onClick={togglePlayPause}>
                                        <i className={`fas ${isPlaying ? 'fa-pause-circle' : 'fa-play-circle'}`}></i>
                                    </button>
                                    <button onClick={() => playNext(false)}><i className="fas fa-step-forward"></i></button>
                                </div>
                                <div className="d-flex align-items-center w-100">
                                    <span>{formatTime(seekTime)}</span>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max={duration} 
                                        value={seekTime} 
                                        onChange={handleSeekChange}
                                        className="mx-2 flex-grow-1"
                                    />
                                    <span>{formatTime(duration)}</span>
                                </div>
                            </div>
                            <div className="volume-control">
                                <i className="fas fa-volume-up"></i>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.01" 
                                    value={volume} 
                                    onChange={handleVolumeChange}
                                />
                            </div>
                            <audio 
                                ref={audioRef} 
                                onTimeUpdate={(e) => setSeekTime(e.target.currentTime)}
                                onLoadedMetadata={(e) => setDuration(e.target.duration)}
                                onEnded={playNext}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                style={{ display: 'none' }}
                            ></audio>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

ReactDOM.render(<App />, document.getElementById('root'));
