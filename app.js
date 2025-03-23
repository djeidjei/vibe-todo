import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, orderBy, query, where, deleteDoc, doc, writeBatch, updateDoc } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDKGWRRvI60EymsMUvw41f4MPLZ9dbX5tQ",
    authDomain: "vibetodo-2f6e0.firebaseapp.com",
    projectId: "vibetodo-2f6e0",
    storageBucket: "vibetodo-2f6e0.firebasestorage.app",
    messagingSenderId: "968899802135",
    appId: "1:968899802135:web:93998aad90c0def5f45852"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Terminal setup
const isMobile = window.innerWidth <= 768;
const cols = isMobile ? Math.floor(window.innerWidth / 10) : 80;
const rows = isMobile ? Math.floor(window.innerHeight / 20) : 24;
const term = new window.Terminal({
    cursorBlink: true,
    cols: cols,
    rows: rows,
    scrollback: 0,
    fontSize: isMobile ? 16 : 12
});
term.open(document.getElementById('terminal'));

let input = '';
let awaitingConfirmation = false;
let pendingCommand = null;
let currentUser = null;
let commandHistory = [];
let historyIndex = -1;

const validCommands = [
    'show me my todos', 'show all', 'add', 'show #', 'clear all', 'clear completed',
    'delete', 'complete', 'edit', 'show done', 'show not done', 'help', 'clear', '+',
    'list', 'list all', 'signup', 'signin', 'signout', 'show hashtags'
];

// Auth state
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    term.clear();
    if (user) {
        term.write(`Welcome back, ${user.email}! v0.1.0\r\nTop Commands:\r\n  add <task> - Add a task\r\n  list - List incomplete tasks\r\n  complete <number> - Complete a task\r\n  help - See all commands\r\n\r\n> `);
    } else {
        term.write('Welcome to your Vibe To-Do App! v0.1.0\r\nPlease sign in or sign up:\r\n  signup <email> <password>\r\n  signin <email> <password>\r\n\r\n> ');
    }
});

// Input handling with command history
term.onData(data => {
    if (awaitingConfirmation) {
        if (data.toLowerCase() === 'y') {
            if (pendingCommand === 'clear all') deleteAllTasks();
            else if (pendingCommand === 'clear completed') hideCompletedTasks();
            awaitingConfirmation = false;
            pendingCommand = null;
            term.write('\r\n\r\n> ');
        } else if (data.toLowerCase() === 'n') {
            term.clear();
            term.write('\r\n\r\nCancelled.\r\n\r\n> ');
            awaitingConfirmation = false;
            pendingCommand = null;
        } else {
            term.clear();
            term.write('\r\n\r\nPlease enter Y or N: ');
        }
    } else {
        if (data === '\r') {
            if (input.trim()) commandHistory.unshift(input.trim());
            if (commandHistory.length > 10) commandHistory.pop(); // Limit history to 10
            historyIndex = -1;
            processCommand(input.trim());
            input = '';
        } else if (data === '\b' || data.charCodeAt(0) === 127) {
            if (input.length > 0) {
                input = input.slice(0, -1);
                term.write('\b \b');
            }
        } else if (data === '\u001b[A') { // Up arrow
            if (commandHistory.length > 0) {
                if (historyIndex < commandHistory.length - 1) historyIndex++;
                input = commandHistory[historyIndex];
                term.write('\r> ' + ' '.repeat(cols - 2) + '\r> ' + input);
            }
        } else if (data >= ' ' && data <= '~') {
            input += data;
            term.write(data);
        }
    }
});

// Process commands
async function processCommand(command) {
    if (!command) {
        term.clear();
        term.write('\r\n\r\n> ');
        return;
    }

    term.clear();
    const fullCommand = command.toLowerCase();
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    const isValidCommand = validCommands.includes(fullCommand) || validCommands.some(c => fullCommand.startsWith(c + ' ') || c === cmd);
    const commandColor = isValidCommand ? '\x1b[35m' : '\x1b[37m';

    let coloredCommand = `${commandColor}${cmd}\x1b[37m${args ? ' ' + colorHashtags(args) : ''}\x1b[0m`;
    term.write('\r\n\r\n' + coloredCommand + '\r\n');

    if (cmd === 'signup') {
        const [email, password] = args.split(' ');
        if (email && password) await signUp(email, password);
        else term.write('\r\n\r\nUsage: signup <email> <password>\r\n\r\n> ');
    } else if (cmd === 'signin') {
        const [email, password] = args.split(' ');
        if (email && password) await signIn(email, password);
        else term.write('\r\n\r\nUsage: signin <email> <password>\r\n\r\n> ');
    } else if (cmd === 'signout') {
        await signOutUser();
    } else if (!currentUser) {
        term.write('\r\n\r\nPlease sign in or sign up first!\r\n\r\n> ');
    } else if (fullCommand === 'show me my todos' || fullCommand === 'show all' || fullCommand === 'list all') {
        await listTasks(true); // Show all tasks
    } else if (fullCommand === 'list') {
        await listTasks(false); // Show only incomplete tasks
    } else if (cmd === 'add' || cmd === '+') {
        const task = command.slice(cmd === 'add' ? 4 : 2).trim();
        if (task) await addTask(task);
    } else if (fullCommand.startsWith('show #')) {
        const hashtag = args.slice(1).trim().replace(/^#+/, '');
        if (hashtag) await listTasksByHashtag(hashtag);
    } else if (fullCommand === 'clear all') {
        term.write('\r\nAre you sure you want to delete all tasks? (Y/N): ');
        awaitingConfirmation = true;
        pendingCommand = 'clear all';
    } else if (fullCommand === 'clear completed') {
        term.write('\r\nAre you sure you want to hide all completed tasks? (Y/N): ');
        awaitingConfirmation = true;
        pendingCommand = 'clear completed';
    } else if (cmd === 'delete') {
        const task = args.trim();
        if (task) await deleteTask(task);
    } else if (cmd === 'complete') {
        const taskInput = args.trim();
        if (taskInput) await completeTask(taskInput);
    } else if (cmd === 'edit') {
        const parts = args.split(' to ');
        if (parts.length === 2) {
            const oldTask = parts[0].trim();
            const newTask = parts[1].trim();
            if (oldTask && newTask) await editTask(oldTask, newTask);
        } else {
            term.write('\r\nUsage: edit <old task> to <new text>\r\n\r\n> ');
        }
    } else if (fullCommand === 'show done') {
        await listTasksByStatus(true);
    } else if (fullCommand === 'show not done') {
        await listTasksByStatus(false);
    } else if (fullCommand === 'show hashtags') {
        await showHashtags();
    } else if (cmd === 'help') {
        showHelp();
    } else if (cmd === 'clear' && !args) {
        term.clear();
        term.write('\r\n\r\n> ');
    } else {
        term.write('\r\nUnknown command. Type "help" for a list of commands.\r\n\r\n> ');
    }
}

// Authentication functions
async function signUp(email, password) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        term.write('\r\n\r\nSigned up successfully! You are now signed in.\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function signIn(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        term.write('\r\n\r\nSigned in successfully!\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function signOutUser() {
    try {
        await signOut(auth);
        term.write('\r\n\r\nSigned out successfully!\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Task management functions
async function addTask(task) {
    try {
        await addDoc(collection(db, `users/${currentUser.uid}/tasks`), { text: task, createdAt: new Date(), completed: false, hidden: false });
        term.write('\r\n\r\nAdded: ' + task + '\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function listTasks(showAll) {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo tasks yet.\r\n\r\n> ');
            return;
        }

        const allTasks = snapshot.docs.map((doc, index) => ({ id: doc.id, number: index + 1, ...doc.data() }));
        const filteredTasks = allTasks.filter(task => showAll || (!task.completed && !task.hidden));
        const totalLines = calculateTotalLines(filteredTasks);
        term.resize(80, Math.max(isMobile ? rows : 24, totalLines));

        term.write('\r\n\r\nLatest 5 Tasks:\r\n');
        const latestTasks = filteredTasks.slice(0, 5);
        latestTasks.forEach(task => {
            const status = task.completed ? '[x]' : '[ ]';
            term.write(' ' + task.number.toString().padStart(2, ' ') + '. ' + status + ' ' + task.text + '\r\n');
        });

        term.write('\r\nTasks by Hashtag:\r\n');
        const noHashtagTasks = filteredTasks.filter(task => !task.text.includes('#'));
        if (noHashtagTasks.length > 0) {
            term.write(' No Hashtag:\r\n');
            noHashtagTasks.forEach(task => {
                const status = task.completed ? '[x]' : '[ ]';
                term.write('   ' + task.number.toString().padStart(2, ' ') + '. ' + status + ' ' + task.text + '\r\n');
            });
        }

        const hashtagMap = {};
        filteredTasks.forEach(task => {
            const hashtags = (task.text.match(/#\w+/g) || []);
            if (hashtags.length === 0) return;
            hashtags.forEach(hashtag => {
                if (!hashtagMap[hashtag]) hashtagMap[hashtag] = [];
                hashtagMap[hashtag].push(task);
            });
        });

        Object.keys(hashtagMap).sort().forEach(hashtag => {
            const coloredHashtag = colorHashtags(hashtag);
            term.write(' ' + coloredHashtag + ':\r\n');
            hashtagMap[hashtag].forEach(task => {
                const status = task.completed ? '[x]' : '[ ]';
                term.write('   ' + task.number.toString().padStart(2, ' ') + '. ' + status + ' ' + task.text + '\r\n');
            });
        });
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

function calculateTotalLines(tasks) {
    let lines = 3; // For "Latest 5 Tasks:" + 2 blank lines
    lines += Math.min(tasks.length, 5); // Latest 5 tasks
    const hashtagMap = {};
    tasks.forEach(task => {
        const hashtags = (task.text.match(/#\w+/g) || []);
        hashtags.forEach(hashtag => {
            if (!hashtagMap[hashtag]) hashtagMap[hashtag] = [];
            hashtagMap[hashtag].push(task);
        });
    });
    lines += 2; // "Tasks by Hashtag:" + blank line
    lines += tasks.filter(task => !task.text.includes('#')).length > 0 ? 1 : 0; // No Hashtag header
    Object.keys(hashtagMap).forEach(hashtag => {
        lines += 1; // Hashtag title
        lines += hashtagMap[hashtag].length; // Tasks under hashtag
    });
    lines += 2; // Final blank lines + prompt
    return lines;
}

async function listTasksByHashtag(hashtag) {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo tasks with #' + hashtag + ' yet.\r\n\r\n> ');
            return;
        }

        const allTasks = snapshot.docs.map((doc, index) => ({ id: doc.id, number: index + 1, ...doc.data() }));
        const tasks = allTasks.filter(task => task.text.includes('#' + hashtag) && !task.hidden);
        const totalLines = tasks.length + 4;
        term.resize(80, Math.max(isMobile ? rows : 24, totalLines));

        term.write('\r\n\r\n');
        const coloredHashtag = colorHashtags('#' + hashtag);
        term.write(coloredHashtag + ':\r\n');
        tasks.forEach(task => {
            const status = task.completed ? '[x]' : '[ ]';
            term.write('  ' + task.number.toString().padStart(2, ' ') + '. ' + status + ' ' + task.text + '\r\n');
        });
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function completeTask(taskInput) {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const allTasks = snapshot.docs.map((doc, index) => ({ id: doc.id, number: index + 1, ...doc.data() }));

        if (!allTasks.length) {
            term.write('\r\n\r\nNo tasks to complete.\r\n\r\n> ');
            return;
        }

        const taskNumber = parseInt(taskInput, 10);
        if (!isNaN(taskNumber) && taskNumber > 0 && taskNumber <= allTasks.length) {
            const taskToComplete = allTasks[taskNumber - 1];
            await updateDoc(doc(db, `users/${currentUser.uid}/tasks`, taskToComplete.id), { completed: true });
            term.write('\r\n\r\nCompleted: ' + taskToComplete.text + '\r\n\r\n> ');
        } else {
            let foundTask = null;
            allTasks.forEach(task => {
                if (task.text.includes(taskInput)) {
                    foundTask = task;
                }
            });
            if (!foundTask) {
                term.write('\r\n\r\nTask "' + taskInput + '" not found. Use a number (e.g., "complete 1") or part of the task text.\r\n\r\n> ');
                return;
            }
            await updateDoc(doc(db, `users/${currentUser.uid}/tasks`, foundTask.id), { completed: true });
            term.write('\r\n\r\nCompleted: ' + foundTask.text + '\r\n\r\n> ');
        }
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function editTask(oldTask, newTask) {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), where('text', '==', oldTask));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nTask "' + oldTask + '" not found.\r\n\r\n> ');
            return;
        }
        const taskDoc = snapshot.docs[0];
        await updateDoc(doc(db, `users/${currentUser.uid}/tasks`, taskDoc.id), { text: newTask, createdAt: new Date() });
        term.write('\r\n\r\nEdited: "' + oldTask + '" to "' + newTask + '"\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function hideCompletedTasks() {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), where('completed', '==', true));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo completed tasks to hide.\r\n\r\n> ');
            return;
        }
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.update(doc.ref, { hidden: true });
        });
        await batch.commit();
        term.write('\r\n\r\nAll completed tasks hidden.\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function listTasksByStatus(completed) {
    try {
        const allQuery = query(collection(db, `users/${currentUser.uid}/tasks`), orderBy('createdAt', 'desc'));
        const allSnapshot = await getDocs(allQuery);
        const allTasks = allSnapshot.docs.map((doc, index) => ({ id: doc.id, number: index + 1, ...doc.data() }));

        const tasks = allTasks.filter(task => task.completed === completed && !task.hidden);
        if (tasks.length === 0) {
            term.write('\r\n\r\nNo ' + (completed ? 'completed' : 'incomplete') + ' tasks yet.\r\n\r\n> ');
            return;
        }

        const totalLines = tasks.length + 4;
        term.resize(80, Math.max(isMobile ? rows : 24, totalLines));

        tasks.forEach(task => {
            const status = task.completed ? '[x]' : '[ ]';
            term.write(' ' + task.number.toString().padStart(2, ' ') + '. ' + status + ' ' + task.text + '\r\n');
        });
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\nCreate this index in Firebase Console: https://console.firebase.google.com/project/vibetodo-2f6e0/firestore/indexes\r\n\r\n> ');
    }
}

async function deleteAllTasks() {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo tasks to delete.\r\n\r\n> ');
            return;
        }
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        term.write('\r\n\r\nAll tasks deleted.\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function deleteTask(taskText) {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), where('text', '==', taskText));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nTask "' + taskText + '" not found.\r\n\r\n> ');
            return;
        }
        const doc = snapshot.docs[0];
        await deleteDoc(doc.ref);
        term.write('\r\n\r\nDeleted: ' + taskText + '\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

async function showHashtags() {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/tasks`), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo hashtags yet.\r\n\r\n> ');
            return;
        }

        const allTasks = snapshot.docs.map(doc => doc.data());
        const hashtagSet = new Set();
        allTasks.forEach(task => {
            const hashtags = task.text.match(/#\w+/g) || [];
            hashtags.forEach(hashtag => hashtagSet.add(hashtag));
        });

        term.write('\r\n\r\nAvailable Hashtags:\r\n');
        Array.from(hashtagSet).sort().forEach(hashtag => {
            term.write(' ' + colorHashtags(hashtag) + '\r\n');
        });
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

function showHelp() {
    term.write('\r\n\r\nAvailable commands:\r\n');
    term.write('  signup <email> <password> - Create a new account\r\n');
    term.write('  signin <email> <password> - Sign in to your account\r\n');
    term.write('  signout             - Sign out of your account\r\n');
    term.write('  add <task>          - Add a new task (e.g., "add call mom #home")\r\n');
    term.write('  list                - List incomplete tasks\r\n');
    term.write('  list all            - List all tasks, including completed\r\n');
    term.write('  show #hashtag       - List tasks with a specific hashtag\r\n');
    term.write('  show hashtags       - List all available hashtags\r\n');
    term.write('  show done           - List completed tasks\r\n');
    term.write('  show not done       - List incomplete tasks\r\n');
    term.write('  complete <number>   - Mark a task as completed by its number (e.g., "complete 1")\r\n');
    term.write('  edit <task> to <new text> - Edit a task\'s text\r\n');
    term.write('  delete <task>       - Delete a specific task\r\n');
    term.write('  clear all           - Delete all tasks (requires Y/N confirmation)\r\n');
    term.write('  clear completed     - Hide all completed tasks (requires Y/N confirmation)\r\n');
    term.write('  clear               - Clear the terminal screen\r\n');
    term.write('  help                - Show this help message\r\n');
    term.write('\r\n> ');
}

function colorHashtags(task) {
    return task.replace(/#(\w+)/g, (match, hashtag) => {
        const colorCode = hashToColor(hashtag);
        return `\x1b[38;5;${colorCode}m${match}\x1b[0m`;
    });
}

function hashToColor(hashtag) {
    let hash = 0;
    for (let i = 0; i < hashtag.length; i++) {
        hash = hashtag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (hash % 256);
}