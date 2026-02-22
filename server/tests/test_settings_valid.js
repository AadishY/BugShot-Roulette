import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

let updateCount = 0;
let roomId;

socket.on('connect', () => {
    console.log('Connected to server');

    // Join a room (will create one since it doesn't exist)
    roomId = 'valid-test-room-' + Date.now();
    console.log(`Joining room ${roomId}...`);
    socket.emit('joinRoom', { roomId, playerName: 'Tester' });
});

socket.on('joinedRoom', ({ room }) => {
    console.log(`Joined room ${room.id} as host`);

    // Attempt to update with valid settings
    const validSettings = {
        hp: 5,
        rounds: 5,
        itemsPerShipment: 5
    };

    console.log('Sending valid settings:', validSettings);
    socket.emit('updateSettings', { roomId: roomId, settings: validSettings });
});

socket.on('roomUpdated', (room) => {
    updateCount++;
    const settings = room.settings;
    console.log(`[Update #${updateCount}] Room updated with settings:`, settings);

    // Check if settings were updated correctly
    if (settings.hp === 5 && settings.rounds === 5 && settings.itemsPerShipment === 5) {
        console.log('SUCCESS: Valid settings were applied.');
        process.exit(0);
    }
});

// Timeout after 5 seconds
setTimeout(() => {
    console.error('TIMEOUT: Valid settings were NOT applied.');
    process.exit(1);
}, 5000);
